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
  homeTeam: { name: string; score: string; rank: string | number };
  awayTeam: { name: string; score: string; rank: string | number };
  status: string;
  clock: string;
  date: string;
  startTime?: string;
}

interface Pick {
  id?: string;
  name: string;
  team: string;
  round: string;
  timestamp?: any;
  createdAt?: string;
  status?: 'pending' | 'won' | 'eliminated';
  resultAt?: any;
}

const participantFullNames = [
  'Patrick Gifford', 'Garret Gotaas', 'Mike Schwartz', 'Derrick Defever', 'Matt Syzmanski',
  'Connor Giroux', 'Nick Dahl', 'Chris Canada', 'Brian Burger', 'Rich Deward',
  'Peter Murray', 'Spenser Pawlik', 'Nick Mowid', 'James Conway', 'Tom Strobel',
  'Zak Burns', 'Alex McAdoo', 'Sean Falvey', 'Tyler Decoster', 'Mike Gallagher'
];

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '').replace(/state/gi, 'st');
}

function isAfter(isoWithTz: string): boolean {
  return new Date() > new Date(isoWithTz);
}

function getShortName(full: string): string {
  const [first, ...rest] = full.trim().split(/\s+/);
  if (rest.length === 0) return full;
  return `${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()} ${rest[rest.length-1][0].toUpperCase()}`;
}

function LiveTicker() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async () => {
    try {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');

      let allEvents: any[] = [];
      for (const dateStr of [formatDate(today), formatDate(tomorrow)]) {
        try {
          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&groups=50&limit=500`
          );
          if (res.ok) {
            const data = await res.json();
            allEvents = [...allEvents, ...(data.events || [])];
          }
        } catch {}
      }

      const formatted = allEvents.map((e: any) => {
        const comp = e.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return null;

        const homeRank = Number(home.curatedRank?.current);
        const awayRank = Number(away.curatedRank?.current);

        return {
          gameId: e.id,
          homeTeam: {
            name: home.team.shortDisplayName || home.team.displayName || '',
            score: home.score || '—',
            rank: !isNaN(homeRank) && homeRank >= 1 && homeRank <= 25 ? homeRank : '',
          },
          awayTeam: {
            name: away.team.shortDisplayName || away.team.displayName || '',
            score: away.score || '—',
            rank: !isNaN(awayRank) && awayRank >= 1 && awayRank <= 25 ? awayRank : '',
          },
          status: comp.status.type.description || 'Scheduled',
          clock: comp.status.displayClock || '',
          date: new Date(comp.date).toISOString().split('T')[0],
          startTime: comp.date,
        };
      }).filter(Boolean) as Game[];

      setGames(formatted.filter(g => {
        const desc = g.status.toLowerCase();
        return !desc.includes('final') && !desc.includes('end') && (g.homeTeam.rank || g.awayTeam.rank);
      }));
    } catch {
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 px-4 text-center font-medium">{error}</div>;
  if (games.length === 0) return <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 px-4 text-center font-medium">No ranked games live/upcoming</div>;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 px-4 overflow-hidden whitespace-nowrap shadow-lg">
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 70s linear infinite; }
      `}</style>
      <div className="inline-flex animate-marquee gap-20">
        {[...games, ...games].map((g, i) => (
          <span key={i} className="font-medium">
            {g.awayTeam.rank ? `#${g.awayTeam.rank} ` : ''}{g.awayTeam.name} {g.awayTeam.score} @
            {g.homeTeam.rank ? `#${g.homeTeam.rank} ` : ''}{g.homeTeam.name} {g.homeTeam.score}
            <span className="text-yellow-300 ml-2 font-semibold">
              {g.status}{g.clock && g.clock !== '0:00' ? ` (${g.clock})` : ''}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [usedTeams, setUsedTeams] = useState<string[]>([]);

  const shortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    const fetchScores = async () => {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const dates = [today, tomorrow].map(d => d.toISOString().split('T')[0].replace(/-/g, ''));

      let events: any[] = [];
      for (const dateStr of dates) {
        try {
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}`);
          if (res.ok) {
            const data = await res.json();
            events = [...events, ...(data.events || [])];
          }
        } catch {}
      }

      const games = events.map((e: any) => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return null;
        return {
          gameId: e.id,
          homeTeam: { name: home.team.shortDisplayName || '', score: home.score || '—', rank: home.curatedRank?.current || '' },
          awayTeam: { name: away.team.shortDisplayName || '', score: away.score || '—', rank: away.curatedRank?.current || '' },
          status: comp?.status?.type?.description || 'Scheduled',
          clock: comp?.status?.displayClock || '',
          date: new Date(comp.date).toISOString().split('T')[0],
          startTime: comp.date,
        };
      }).filter(Boolean) as Game[];

      setScoreboard(games);
    };

    fetchScores();
    const interval = setInterval(fetchScores, 90000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as Pick));
      const grouped = new Map<string, Pick[]>();
      raw.forEach(p => {
        if (!p.name) return;
        if (!grouped.has(p.name)) grouped.set(p.name, []);
        grouped.get(p.name)!.push(p);
      });
      const users = Array.from(grouped.entries()).map(([name, picks]) => ({
        name,
        picks: picks.sort((a, b) => (a.createdAt || '0').localeCompare(b.createdAt || '0')),
        status: picks.some(p => p.status === 'eliminated') ? 'eliminated' : 'alive',
      }));
      setAllUsers(users);
      setLoading(false);

      const me = users.find(u => u.name === shortName);
      if (me) setUsedTeams(me.picks.map((p: Pick) => p.team).filter(Boolean));
    });
    return unsub;
  }, [shortName]);

  useEffect(() => {
    if (!scoreboard.length || !allUsers.length) return;

    allUsers.forEach(user => {
      user.picks.forEach(async (pick: Pick) => {
        if (pick.status && pick.status !== 'pending') return;

        const dayNum = Number(pick.round.replace('Day ', ''));
        const today = new Date();
        const dayDate = new Date(today);
        dayDate.setDate(today.getDate() + dayNum - 1);
        const dayStr = dayDate.toISOString().split('T')[0];

        const game = scoreboard.find(g => g.date === dayStr &&
          (normalizeTeamName(g.homeTeam.name).includes(normalizeTeamName(pick.team)) ||
           normalizeTeamName(g.awayTeam.name).includes(normalizeTeamName(pick.team)))
        );

        if (!game) return;

        const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('end');
        if (!isFinal) return;

        const h = Number(game.homeTeam.score) || 0;
        const a = Number(game.awayTeam.score) || 0;
        if (h === 0 && a === 0) return;

        const pickedNorm = normalizeTeamName(pick.team);
        const isHome = normalizeTeamName(game.homeTeam.name).includes(pickedNorm);
        const won = isHome ? h > a : a > h;

        const q = query(collection(db, 'picks'), where('name','==',user.name), where('round','==',pick.round));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'picks', snap.docs[0].id), {
            status: won ? 'won' : 'eliminated',
            resultAt: serverTimestamp(),
          });
        }
      });
    });
  }, [scoreboard, allUsers]);

  const handleSubmit = async () => {
    if (!firstName.trim() || lastInitial.length !== 1) {
      setStatusMessage('First name + one initial required');
      return;
    }

    if (shortName.toLowerCase() === 'stanley s') {
      setIsAdmin(true);
      setStatusMessage('Admin mode activated');
      setFirstName(''); setLastInitial('');
      return;
    }

    const allowed = participantFullNames.some(f => getShortName(f) === shortName);
    if (!allowed) {
      setStatusMessage('Name not recognized');
      return;
    }

    const user = allUsers.find(u => u.name === shortName);
    if (user?.status === 'eliminated') {
      setStatusMessage('You are eliminated');
      return;
    }

    const today = new Date();
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() + currentDay - 1);
    const noonToday = new Date(dayDate);
    noonToday.setHours(12, 0, 0, 0);

    if (new Date() >= noonToday) {
      setStatusMessage('Picks locked for this day (noon ET passed)');
      return;
    }

    if (usedTeams.includes(selectedTeam)) {
      setStatusMessage(`Already picked ${selectedTeam}`);
      return;
    }

    try {
      const round = `Day ${currentDay}`;
      const q = query(collection(db, 'picks'), where('name','==',shortName), where('round','==',round));
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, 'picks', existing.docs[0].id), {
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
          status: 'pending',
        });
      }

      setStatusMessage(`Saved: ${selectedTeam}`);
      setSelectedTeam('');
    } catch (err: any) {
      setStatusMessage('Error: ' + err.message);
    }
  };

  const today = new Date();
  const dayDate = new Date(today);
  dayDate.setDate(today.getDate() + currentDay - 1);
  const dayStr = dayDate.toISOString().split('T')[0];

  const dayGames = scoreboard.filter(g => g.date === dayStr);
  const availableTeams = [...new Set(dayGames.flatMap(g => [g.homeTeam.name, g.awayTeam.name].filter(Boolean)))].sort((a,b)=>a.localeCompare(b));

  const myUser = allUsers.find(u => u.name === shortName);
  const isEliminated = myUser?.status === 'eliminated';

  const noonToday = new Date(dayDate);
  noonToday.setHours(12, 0, 0, 0);
  const dayLocked = new Date() >= noonToday;

  return (
    <>
      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] pt-28 pb-12 px-4 md:px-8">
        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg"
          alt="March Madness"
          width={400}
          height={200}
          className="mx-auto mb-6 rounded-lg"
          priority
        />

        <h1 className="text-4xl md:text-5xl font-bold text-[#2A6A5E] text-center mb-2">
          NCAA Survivor Pool
        </h1>
        <p className="text-xl text-gray-700 text-center mb-8 max-w-2xl mx-auto">
          Pick one team per day — no repeats — last one standing wins
        </p>

        <div className="flex justify-center gap-4 mb-8">
          <input
            placeholder="First Name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="px-4 py-2 border rounded w-52"
          />
          <input
            placeholder="L"
            maxLength={1}
            value={lastInitial}
            onChange={e => setLastInitial(e.target.value.toUpperCase().slice(0,1))}
            className="w-14 text-center px-2 py-2 border rounded"
          />
        </div>

        {isAdmin && <p className="text-center text-purple-700 font-bold mb-6">ADMIN MODE — picks visible</p>}

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {[1,2,3].map(d => (
            <button
              key={d}
              onClick={() => setCurrentDay(d)}
              className={`px-6 py-2 rounded-full ${currentDay === d ? 'bg-[#2A6A5E] text-white' : 'bg-gray-200'}`}
            >
              Day {d} {d === 1 ? '(today)' : '(tomorrow)'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3 max-w-5xl mx-auto mb-10">
          {availableTeams.length === 0 ? (
            <p className="text-gray-500 italic">No games found for this day yet...</p>
          ) : (
            availableTeams.map(team => {
              const disabled = usedTeams.includes(team) || dayLocked || isEliminated;
              return (
                <button
                  key={team}
                  onClick={() => !disabled && setSelectedTeam(team)}
                  disabled={disabled}
                  className={`px-6 py-3 border-2 border-[#2A6A5E] rounded-lg min-w-[160px] ${
                    selectedTeam === team ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'
                  } ${disabled ? 'opacity-60 line-through bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  {team}
                </button>
              );
            })
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedTeam || !shortName || dayLocked || isEliminated}
          className="mx-auto block w-full max-w-md bg-[#2A6A5E] text-white py-4 rounded-xl text-xl hover:bg-[#1e4c43] disabled:opacity-50 shadow"
        >
          {dayLocked ? 'Locked' : isEliminated ? 'Eliminated' : 'Submit Pick'}
        </button>

        {statusMessage && <p className={`mt-6 text-center text-lg ${statusMessage.includes('Error') || statusMessage.includes('locked') ? 'text-red-600' : 'text-[#2A6A5E]'}`}>{statusMessage}</p>}

        <div className="w-full max-w-5xl mt-16 overflow-x-auto">
          <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">Standings & Picks</h2>
          {loading ? (
            <p className="text-center text-gray-600">Loading...</p>
          ) : (
            <table className="w-full bg-white rounded-lg shadow overflow-hidden">
              <thead className="bg-[#2A6A5E] text-white">
                <tr>
                  <th className="py-4 px-5 text-left">Name</th>
                  <th className="py-4 px-5 text-center">Status</th>
                  <th className="py-4 px-5 text-center">Day 1</th>
                  <th className="py-4 px-5 text-center">Day 2</th>
                  <th className="py-4 px-5 text-center">Day 3</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map(user => {
                  const isMe = user.name === shortName;
                  const visible = isMe || isAdmin;
                  const isDead = user.status === 'eliminated';

                  return (
                    <tr key={user.name} className={`border-b hover:bg-gray-50 ${isDead ? 'bg-red-50 line-through opacity-80' : ''}`}>
                      <td className={`py-4 px-5 font-medium ${isDead ? 'text-red-600' : 'text-gray-800'}`}>{user.name}</td>
                      <td className="py-4 px-5 text-center">
                        {isDead ? <span className="text-red-600 font-bold">Dead</span> : <span className="text-green-600 font-bold">Alive</span>}
                      </td>
                      {[1,2,3].map(d => {
                        const round = `Day ${d}`;
                        const pickObj = user.picks.find((p: Pick) => p.round === round);
                        const pickTeam = pickObj?.team || '—';

                        let cellClass = 'bg-gray-50 text-gray-500';
                        let display = pickTeam;

                        if (pickTeam !== '—') {
                          if (pickObj?.status === 'won') cellClass = 'bg-green-100 text-green-800 font-bold';
                          else if (pickObj?.status === 'eliminated') cellClass = 'bg-red-100 text-red-800 font-bold line-through';
                          else cellClass = 'bg-yellow-100 text-yellow-800';
                        } else if (d === currentDay && dayLocked) {
                          display = <span className="text-red-600 font-bold">SHAME</span>;
                          cellClass = 'bg-red-50';
                        }

                        return (
                          <td key={d} className={`py-4 px-5 text-center font-semibold ${visible ? cellClass : 'bg-gray-200 text-transparent blur-sm'}`}>
                            {visible ? display : '█████'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="mt-20 text-gray-600 text-sm text-center">
          Created by Mike Schwartz • Troy, MI
        </footer>
      </main>
    </>
  );
}