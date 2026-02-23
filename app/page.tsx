'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore';

interface Game {
  gameId: string;
  homeTeam: { name: string; score: string; rank?: number };
  awayTeam: { name: string; score: string; rank?: number };
  status: string;
  clock?: string;
  date: string;
  startTime: string;
}

interface Pick {
  id?: string;
  name: string;
  team: string;
  round: string;
  timestamp?: any;
  createdAt?: string;
  status?: string;
}

const pickDates = [
  { day: 1, label: 'Tue Feb 24', date: '2026-02-24', noonET: '2026-02-24T12:00:00-05:00' },
  { day: 2, label: 'Wed Feb 25', date: '2026-02-25', noonET: '2026-02-25T12:00:00-05:00' },
  { day: 3, label: 'Thu Feb 26', date: '2026-02-26', noonET: '2026-02-26T12:00:00-05:00' },
  { day: 4, label: 'Fri Feb 27', date: '2026-02-27', noonET: '2026-02-27T12:00:00-05:00' },
  { day: 5, label: 'Sat Feb 28', date: '2026-02-28', noonET: '2026-02-28T12:00:00-05:00' },
  { day: 6, label: 'Sun Mar 1',  date: '2026-03-01', noonET: '2026-03-01T12:00:00-05:00' },
];

const participants = [
  'Patrick Gifford', 'Garret Gotaas', 'Mike Schwartz', 'Derrick Defever', 'Matt Syzmanski',
  'Connor Giroux', 'Nick Dahl', 'Chris Canada', 'Brian Burger', 'Rich Deward',
  'Peter Murray', 'Spenser Pawlik', 'Nick Mowid', 'James Conway', 'Tom Strobel',
  'Zak Burns', 'Alex McAdoo', 'Sean Falvey', 'Tyler Decoster', 'Mike Gallagher',
];

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [picksData, setPicksData] = useState<any[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [nameLocked, setNameLocked] = useState(false);
  const [usedTeams, setUsedTeams] = useState<string[]>([]);

  const shortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${today}`
        );
        if (!res.ok) return;
        const data = await res.json();

        const events = data.events || [];
        const formatted = events
          .map((e: any) => {
            const comp = e.competitions?.[0];
            if (!comp) return null;
            const home = comp.competitors.find((c: any) => c.homeAway === 'home');
            const away = comp.competitors.find((c: any) => c.homeAway === 'away');
            if (!home || !away) return null;

            return {
              gameId: e.id,
              homeTeam: { name: home.team.shortDisplayName || '', score: home.score || '—', rank: home.curatedRank?.current },
              awayTeam: { name: away.team.shortDisplayName || '', score: away.score || '—', rank: away.curatedRank?.current },
              status: comp.status?.type?.description || 'Scheduled',
              clock: comp.status?.displayClock || '',
              date: e.date ? new Date(e.date).toISOString().split('T')[0] : '',
              startTime: e.date || '',
            };
          })
          .filter((g: any) => !!g && g.homeTeam?.name && g.awayTeam?.name) as Game[];

        setGames(formatted);
      } catch (err) {
        console.error('Scoreboard fetch failed:', err);
      }
    };

    fetchScores();
    const id = setInterval(fetchScores, 120000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const picks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const grouped = picks.reduce((acc: any, p: any) => {
        if (!p.name) return acc;
        if (!acc[p.name]) acc[p.name] = { name: p.name, picks: [], status: 'alive' };
        acc[p.name].picks.push(p);
        if (p.status === 'eliminated') acc[p.name].status = 'eliminated';
        return acc;
      }, {});
      setPicksData(Object.values(grouped));
      setLoading(false);
    }, (err) => {
      console.error('Picks snapshot error:', err);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!shortName) return;
    const user = picksData.find(u => u.name === shortName);
    if (user) {
      setNameLocked(true);
      setUsedTeams(user.picks.map((p: any) => p.team));
    }
  }, [shortName, picksData]);

  const isLocked = (day: number) => {
    const d = pickDates.find(p => p.day === day);
    return d ? new Date() >= new Date(d.noonET) : false;
  };

  const dayLocked = isLocked(currentDay);

  const dayTeams = games
    .filter(g => g.date === pickDates.find(p => p.day === currentDay)?.date)
    .flatMap(g => [g.homeTeam.name, g.awayTeam.name])
    .filter(Boolean);

  const available = [...new Set(dayTeams)].sort();

  const handleSubmit = async () => {
    if (!firstName.trim() || lastInitial.length !== 1 || !/^[A-Z]$/.test(lastInitial.toUpperCase())) {
      setStatusMessage('First name + one capital letter initial required');
      return;
    }

    if (shortName.toLowerCase().includes('stanley') && lastInitial.toUpperCase() === 'S') {
      setIsAdmin(true);
      setStatusMessage('Admin mode activated');
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    if (!participants.some(p => p.replace(/\s+/g,'').toLowerCase() === shortName.replace(/\s+/g,'').toLowerCase())) {
      setStatusMessage('Name not recognized – check spelling');
      return;
    }

    if (dayLocked) {
      setStatusMessage('Picks locked for this day');
      return;
    }

    if (usedTeams.includes(selectedTeam)) {
      setStatusMessage('You already picked this team');
      return;
    }

    try {
      const round = `Day ${currentDay}`;
      const existingQ = query(
        collection(db, 'picks'),
        where('name', '==', shortName),
        where('round', '==', round)
      );
      const snap = await getDocs(existingQ);

      if (!snap.empty) {
        await updateDoc(doc(db, 'picks', snap.docs[0].id), {
          team: selectedTeam,
          timestamp: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'picks'), {
          name: shortName,
          team: selectedTeam,
          round,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });
      }

      setStatusMessage(`Saved ${selectedTeam} for ${pickDates[currentDay-1].label}`);
      setSelectedTeam('');
    } catch (err: any) {
      setStatusMessage('Error: ' + err.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 pt-20 pb-12 px-4">
      <div className="max-w-5xl mx-auto">

        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg"
          alt="March Madness"
          width={360}
          height={180}
          className="mx-auto mb-6"
          priority
        />

        <h1 className="text-4xl md:text-5xl font-bold text-teal-700 text-center mb-3">
          Survivor Pool – Tue Feb 24 to Sun Mar 1
        </h1>

        <p className="text-center text-gray-700 mb-8">
          One team per day – no repeats – last one standing wins
        </p>

        <div className="flex gap-4 justify-center mb-8">
          <input
            placeholder="First name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            disabled={nameLocked}
            className="border rounded px-4 py-2 w-52"
          />
          <input
            placeholder="L"
            maxLength={1}
            value={lastInitial.toUpperCase()}
            onChange={e => setLastInitial(e.target.value.slice(0,1).toUpperCase())}
            disabled={nameLocked}
            className="border rounded px-3 py-2 w-12 text-center"
          />
        </div>

        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {pickDates.map(d => (
            <button
              key={d.day}
              onClick={() => setCurrentDay(d.day)}
              className={`px-5 py-2 rounded-full ${currentDay === d.day ? 'bg-teal-700 text-white' : 'bg-gray-200'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {available.length === 0 ? (
            <p className="text-gray-500">No games loaded yet for {pickDates[currentDay-1].label}</p>
          ) : available.map(team => (
            <button
              key={team}
              onClick={() => !usedTeams.includes(team) && !dayLocked && setSelectedTeam(team)}
              disabled={usedTeams.includes(team) || dayLocked}
              className={`px-6 py-3 border-2 border-teal-700 rounded-lg min-w-[140px]
                ${selectedTeam === team ? 'bg-teal-700 text-white' : 'bg-white text-teal-700'}
                ${usedTeams.includes(team) || dayLocked ? 'opacity-50 line-through' : 'hover:bg-teal-50'}`}
            >
              {team}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedTeam || !firstName.trim() || lastInitial.length !== 1 || dayLocked}
          className="block mx-auto bg-teal-700 text-white px-10 py-4 rounded-xl text-xl font-semibold disabled:opacity-50"
        >
          Submit Pick
        </button>

        {statusMessage && (
          <p className="text-center mt-6 text-lg font-medium text-teal-700">{statusMessage}</p>
        )}

        <div className="mt-16">
          <h2 className="text-2xl font-bold text-teal-700 mb-4 text-center">Picks</h2>
          {loading ? (
            <p className="text-center">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-teal-700 text-white">
                    <th className="p-3 text-left">Name</th>
                    <th className="p-3">Status</th>
                    {pickDates.map(d => (
                      <th key={d.day} className="p-3 text-center">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {picksData.map(user => (
                    <tr key={user.name} className="border-b">
                      <td className="p-3">{user.name}</td>
                      <td className="p-3 text-center">
                        {user.status === 'eliminated' ? 'Out' : 'Alive'}
                      </td>
                      {pickDates.map(d => {
                        const p = user.picks.find((pick: any) => pick.round === `Day ${d.day}`);
                        return (
                          <td key={d.day} className="p-3 text-center">
                            {p?.team || '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}