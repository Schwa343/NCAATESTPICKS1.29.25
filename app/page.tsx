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
  status?: string;
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/state/gi, 'st')
    .replace(/ohio/gi, 'oh')
    .replace(/northern/gi, 'n')
    .replace(/southern/gi, 's')
    .replace(/miami oh/gi, 'miamioh');
}

function formatESTTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
}

function LiveTicker() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async () => {
    try {
      setError(null);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');

      const datesToFetch = [formatDate(yesterday), formatDate(today)];

      let allEvents: any[] = [];

      for (const dateStr of datesToFetch) {
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}`
        );
        if (res.ok) {
          const data = await res.json();
          allEvents = [...allEvents, ...(data.events || [])];
        }
      }

      const formatted = allEvents
        .map((e: any) => {
          const comp = e.competitions?.[0];
          if (!comp) return null;
          const home = comp.competitors.find((c: any) => c.homeAway === 'home');
          const away = comp.competitors.find((c: any) => c.homeAway === 'away');
          if (!home || !away) return null;

          const homeRankNum = Number(home.curatedRank?.current);
          const awayRankNum = Number(away.curatedRank?.current);

          return {
            gameId: e.id,
            homeTeam: {
              name: home.team.shortDisplayName || home.team.displayName || '',
              score: home.score || '—',
              rank: !isNaN(homeRankNum) && homeRankNum >= 1 && homeRankNum <= 25 ? homeRankNum : '',
            },
            awayTeam: {
              name: away.team.shortDisplayName || away.team.displayName || '',
              score: away.score || '—',
              rank: !isNaN(awayRankNum) && awayRankNum >= 1 && awayRankNum <= 25 ? awayRankNum : '',
            },
            status: comp.status.type.description || 'Scheduled',
            clock: comp.status.displayClock || '',
            date: comp.date ? new Date(comp.date).toISOString().split('T')[0] : '',
            startTime: comp.date || '',
          };
        })
        .filter((g): g is Game => !!g);

      const rankedOnly = formatted.filter((g) => {
        return typeof g.homeTeam.rank === 'number' || typeof g.awayTeam.rank === 'number';
      });

      setGames(rankedOnly);
    } catch (err) {
      console.error('LiveTicker fetch error:', err);
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 px-4 text-center font-medium">{error}</div>;
  }

  if (games.length === 0) {
    return <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 px-4 text-center font-medium">No ranked games live/upcoming right now</div>;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 px-4 overflow-hidden whitespace-nowrap shadow-lg">
      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 60s linear infinite;
        }
      `}</style>
      <div className="inline-flex animate-marquee gap-20">
        {games.concat(games).map((game, i) => (
          <span key={i} className="font-medium">
            {game.awayTeam.rank ? `#${game.awayTeam.rank} ` : ''}
            {game.awayTeam.name} {game.awayTeam.score} @
            {game.homeTeam.rank ? `#${game.homeTeam.rank} ` : ''}
            {game.homeTeam.name} {game.homeTeam.score}
            {' '}
            <span className="text-yellow-300 font-semibold">
              {game.status} {game.clock && `(${game.clock})`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const pickDates = [
  { day: 1, label: 'Mon Feb 24', date: '2026-02-24', noonET: '2026-02-24T12:00:00-05:00' },
  { day: 2, label: 'Tue Feb 25', date: '2026-02-25', noonET: '2026-02-25T12:00:00-05:00' },
  { day: 3, label: 'Wed Feb 26', date: '2026-02-26', noonET: '2026-02-26T12:00:00-05:00' },
  { day: 4, label: 'Thu Feb 27', date: '2026-02-27', noonET: '2026-02-27T12:00:00-05:00' },
  { day: 5, label: 'Fri Feb 28', date: '2026-02-28', noonET: '2026-02-28T12:00:00-05:00' },
  { day: 6, label: 'Sat Mar 1', date: '2026-03-01', noonET: '2026-03-01T12:00:00-05:00' },
];

const participantNames = [
  'Patrick Gifford', 'Garret Gotaas', 'Mike Schwartz', 'Derrick Defever', 'Matt Syzmanski',
  'Connor Giroux', 'Nick Dahl', 'Chris Canada', 'Brian Burger', 'Rich Deward',
  'Peter Murray', 'Spenser Pawlik', 'Nick Mowid', 'James Conway', 'Tom Strobel',
  'Zak Burns', 'Alex McAdoo', 'Sean Falvey', 'Tyler Decoster', 'Mike Gallagher',
];

const averageDaysSurvived: Record<string, number> = {
  "Patrick Gifford": 4.4, "Garret Gotaas": 2.8, "Mike Schwartz": 3.5, "Derrick Defever": 2.9,
  "Matt Syzmanski": 4.1, "Connor Giroux": 3.1, "Nick Dahl": 4.4, "Chris Canada": 2.9,
  "Brian Burger": 4.0, "Rich Deward": 4.4, "Peter Murray": 3.1, "Spenser Pawlik": 3.7,
  "Nick Mowid": 3.4, "James Conway": 3.3, "Tom Strobel": 1.0, "Zak Burns": 1.4,
  "Alex McAdoo": 5.0, "Sean Falvey": 4.0, "Tyler Decoster": 6.5, "Mike Gallagher": 1.0,
};

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [userPicks, setUserPicks] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [forceRevealed, setForceRevealed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingCell, setEditingCell] = useState<{ name: string; round: string } | null>(null);
  const [currentDay, setCurrentDay] = useState(1);
  const [nameLocked, setNameLocked] = useState(false);
  const [usedTeams, setUsedTeams] = useState<string[]>([]);

  const currentShortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    const fetchScores = async () => {
      try {
        let allEvents: any[] = [];
        const today = new Date();

        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');

          const res = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}`
          );
          if (res.ok) {
            const data = await res.json();
            allEvents = [...allEvents, ...(data.events || [])];
          }
        }

        const formatted = allEvents
          .map((e: any) => {
            const comp = e.competitions?.[0];
            if (!comp) return null;
            const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
            const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
            if (!home || !away) return null;

            return {
              gameId: e.id,
              homeTeam: { name: home.team.shortDisplayName || '', score: home.score || '—', rank: home.curatedRank?.current || '' },
              awayTeam: { name: away.team.shortDisplayName || '', score: away.score || '—', rank: away.curatedRank?.current || '' },
              status: comp.status?.type?.description || 'Scheduled',
              clock: comp.status?.displayClock || '',
              date: comp.date ? new Date(comp.date).toISOString().split('T')[0] : '',
              startTime: comp.date || '',
            };
          })
          .filter((g): g is Game => !!g && g.homeTeam.name && g.awayTeam.name);

        setScoreboard(formatted);
      } catch (err) {
        console.error('Scoreboard fetch error:', err);
      }
    };

    fetchScores();
    const interval = setInterval(fetchScores, 90000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Pick));
      const grouped = new Map<string, Pick[]>();
      all.forEach((pick) => {
        if (pick.name) {
          if (!grouped.has(pick.name)) grouped.set(pick.name, []);
          grouped.get(pick.name)!.push(pick);
        }
      });
      const formatted = Array.from(grouped.entries()).map(([name, picks]) => ({
        name,
        picks: picks.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()),
        status: picks.some((p) => p.status === 'eliminated') ? 'eliminated' : 'alive',
      }));
      setUserPicks(formatted);
      setLoading(false);
    }, (err) => {
      console.error('Picks snapshot error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (scoreboard.length === 0 || userPicks.length === 0) return;

    userPicks.forEach(async (user) => {
      const alivePicks = user.picks.filter((p: Pick) => p.status !== 'eliminated');

      for (const pick of alivePicks) {
        const dayInfo = pickDates.find((d) => `Day ${d.day}` === pick.round);
        if (!dayInfo) continue;

        const normalizedPick = normalizeTeamName(pick.team);
        const game = scoreboard.find((g) => g.date === dayInfo.date &&
          (normalizeTeamName(g.homeTeam.name).includes(normalizedPick) ||
           normalizeTeamName(g.awayTeam.name).includes(normalizedPick)));

        if (!game) continue;

        const statusLower = game.status.toLowerCase();
        const isFinal = statusLower.includes('final') || statusLower.includes('end') || statusLower.includes('complete');

        if (!isFinal) continue;

        const homeScore = Number(game.homeTeam.score) || 0;
        const awayScore = Number(game.awayTeam.score) || 0;

        if (homeScore === 0 && awayScore === 0) continue;

        const homeNorm = normalizeTeamName(game.homeTeam.name);
        const awayNorm = normalizeTeamName(game.awayTeam.name);
        const isHome = homeNorm.includes(normalizedPick) || normalizedPick.includes(homeNorm);
        const won = (isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore);

        try {
          const ref = collection(db, 'picks');
          const q = query(ref, where('name', '==', user.name), where('round', '==', pick.round));
          const existing = await getDocs(q);
          if (!existing.empty) {
            await updateDoc(doc(db, 'picks', existing.docs[0].id), {
              status: won ? 'won' : 'eliminated',
              resultAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.error('Pick result update failed:', err);
        }
      }
    });
  }, [scoreboard, userPicks]);

  useEffect(() => {
    if (!currentShortName) return;
    const user = userPicks.find((u) => u.name === currentShortName);
    if (user) {
      setNameLocked(true);
      setUsedTeams(user.picks.map((p: Pick) => p.team).filter(Boolean));
    }
  }, [currentShortName, userPicks]);

  const isDayLocked = (day: number) => {
    const info = pickDates.find((d) => d.day === day);
    return info ? new Date() >= new Date(info.noonET) : false;
  };

  const currentDayLocked = isDayLocked(currentDay);

  const availableTeams = (() => {
    const dayInfo = pickDates.find((d) => d.day === currentDay);
    if (!dayInfo) return [];
    const games = scoreboard.filter((g) => g.date === dayInfo.date);
    return [...new Set(games.flatMap((g) => [g.homeTeam.name, g.awayTeam.name]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  })();

  const handleSubmit = async () => {
    const trimmedFirst = firstName.trim();
    const trimmedInitial = lastInitial.trim().toUpperCase();

    if (!trimmedFirst || trimmedInitial.length !== 1 || !/^[A-Z]$/.test(trimmedInitial)) {
      setStatusMessage('Enter first name + one uppercase initial (A-Z)');
      return;
    }

    const shortName = `${trimmedFirst.charAt(0).toUpperCase() + trimmedFirst.slice(1).toLowerCase()} ${trimmedInitial}`;

    if (trimmedFirst.toLowerCase() === 'stanley' && trimmedInitial === 'S') {
      setForceRevealed(true);
      setIsAdmin(true);
      setStatusMessage('Admin mode activated — picks revealed & editable!');
      setTimeout(() => setStatusMessage(''), 4000);
      setFirstName('');
      setLastInitial('');
      return;
    }

    if (!participantNames.map((n) => n.toLowerCase().replace(/\s+/g, '')).includes(shortName.toLowerCase().replace(/\s+/g, ''))) {
      setStatusMessage(`"${shortName}" not in the league list — check spelling`);
      return;
    }

    const user = userPicks.find((u) => u.name === shortName);
    if (user && user.status === 'eliminated') {
      setStatusMessage('You are eliminated — no more picks allowed');
      return;
    }

    if (currentDayLocked) {
      setStatusMessage(`Picks for ${pickDates[currentDay - 1].label} are locked (noon ET passed)`);
      return;
    }

    if (usedTeams.includes(selectedTeam)) {
      setStatusMessage(`You already picked ${selectedTeam} on a previous day`);
      return;
    }

    if (!selectedTeam) {
      setStatusMessage('Select a team first');
      return;
    }

    const round = `Day ${currentDay}`;

    setStatusMessage('Saving...');

    try {
      const ref = collection(db, 'picks');
      const q = query(ref, where('name', '==', shortName), where('round', '==', round));
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, 'picks', existing.docs[0].id), {
          team: selectedTeam,
          timestamp: serverTimestamp(),
        });
      } else {
        await addDoc(ref, {
          name: shortName,
          team: selectedTeam,
          round,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
        });
      }

      setStatusMessage(`Saved: ${selectedTeam} for ${pickDates[currentDay - 1].label}`);
      setSelectedTeam('');
      setNameLocked(true);
    } catch (err: any) {
      setStatusMessage('Error saving pick: ' + err.message);
    }
  };

  const getPickForDay = (picks: Pick[], round: string) => {
    return picks.find((p) => p.round === round)?.team || '—';
  };

  const getPickColor = (team: string, round: string) => {
    if (team === '—') return 'bg-gray-100 text-gray-800';

    const dayInfo = pickDates.find((d) => `Day ${d.day}` === round);
    if (!dayInfo) return 'bg-gray-100 text-gray-800';

    const normalizedTeam = normalizeTeamName(team);

    const game = scoreboard.find((g) => g.date === dayInfo.date &&
      (normalizeTeamName(g.homeTeam.name).includes(normalizedTeam) ||
       normalizeTeamName(g.awayTeam.name).includes(normalizedTeam)));

    if (!game) return 'bg-gray-100 text-gray-800';

    const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('end');

    if (!isFinal) return 'bg-yellow-100 text-yellow-800';

    const homeScore = Number(game.homeTeam.score) || 0;
    const awayScore = Number(game.awayTeam.score) || 0;

    const homeNorm = normalizeTeamName(game.homeTeam.name);
    const awayNorm = normalizeTeamName(game.awayTeam.name);
    const isHome = homeNorm.includes(normalizedTeam) || normalizedTeam.includes(homeNorm);

    if (homeScore > awayScore && isHome) return 'bg-green-100 text-green-800';
    if (awayScore > homeScore && !isHome) return 'bg-green-100 text-green-800';
    if (homeScore < awayScore && isHome) return 'bg-red-100 text-red-800';
    if (awayScore < homeScore && !isHome) return 'bg-red-100 text-red-800';

    return 'bg-yellow-100 text-yellow-800';
  };

  const displayedParticipants = participantNames.map((full) => {
    const short = `${full.split(' ')[0]} ${full.split(' ').pop()?.[0].toUpperCase()}`;
    const userData = userPicks.find((u) => u.name === short) || { picks: [], status: 'alive' };
    return { fullName: full, shortName: short, picks: userData.picks, status: userData.status };
  }).sort((a, b) => {
    if (a.shortName === currentShortName) return -1;
    if (b.shortName === currentShortName) return 1;
    if (a.status === 'alive' && b.status !== 'alive') return -1;
    if (a.status !== 'alive' && b.status === 'alive') return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const selectedDayInfo = pickDates.find((d) => d.day === currentDay);

  return (
    <>
      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] flex flex-col items-center pt-28 pb-8 px-4 md:px-8">
        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg"
          alt="March Madness"
          width={400}
          height={200}
          className="mb-4 rounded-lg"
          priority
        />

        <h1 className="text-4xl md:text-5xl font-bold text-[#2A6A5E] mb-4 text-center">
          NCAA Survivor Pool – Feb 24 to Mar 1
        </h1>
        <p className="text-xl text-gray-700 mb-8 text-center max-w-2xl">
          Pick one team per day — no repeats allowed. Survive the longest!
        </p>

        {isAdmin && (
          <p className="text-center text-lg font-bold text-purple-700 mb-6">
            ADMIN MODE — Click cells to edit picks
          </p>
        )}

        <div className="mb-8 flex gap-4">
          <input
            type="text"
            placeholder="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={nameLocked}
            className="px-4 py-2 border rounded w-48"
          />
          <input
            type="text"
            placeholder="L"
            maxLength={1}
            value={lastInitial}
            onChange={(e) => setLastInitial(e.target.value.toUpperCase().slice(0, 1))}
            disabled={nameLocked}
            className="px-3 py-2 border rounded w-14 text-center"
          />
        </div>

        <div className="mb-8 flex flex-wrap gap-3 justify-center">
          {pickDates.map((d) => (
            <button
              key={d.day}
              onClick={() => setCurrentDay(d.day)}
              className={`px-5 py-2 rounded-full font-medium ${currentDay === d.day ? 'bg-[#2A6A5E] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10 max-w-5xl">
          {availableTeams.length === 0 ? (
            <p className="text-gray-500 italic">No games loaded for {selectedDayInfo?.label} yet...</p>
          ) : (
            availableTeams.map((team) => {
              const isUsed = usedTeams.includes(team);
              const game = scoreboard.find((g) => g.homeTeam.name === team || g.awayTeam.name === team);
              const rank = game ? (game.homeTeam.name === team ? game.homeTeam.rank : game.awayTeam.rank) : '';
              const rankDisplay = rank ? `#${rank} ` : '';

              return (
                <button
                  key={team}
                  onClick={() => !isUsed && !currentDayLocked && setSelectedTeam(team)}
                  disabled={isUsed || currentDayLocked}
                  className={`px-5 py-2.5 min-w-[160px] border-2 border-[#2A6A5E] rounded-lg font-medium transition-all
                    ${selectedTeam === team ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'}
                    ${isUsed || currentDayLocked ? 'opacity-60 line-through cursor-not-allowed bg-gray-100' : ''}`}
                >
                  {rankDisplay}{team}
                </button>
              );
            })
          )}
        </div>

        <button
          disabled={!selectedTeam || !firstName.trim() || lastInitial.length !== 1 || currentDayLocked}
          onClick={handleSubmit}
          className="w-full max-w-md bg-[#2A6A5E] text-white py-4 rounded-xl text-xl font-semibold hover:bg-[#1e4c43] transition disabled:opacity-50 disabled:cursor-not-allowed shadow"
        >
          {currentDayLocked ? `Locked (${selectedDayInfo?.label})` : 'Submit / Change Pick'}
        </button>

        {currentDayLocked && (
          <p className="mt-4 text-center text-lg text-red-600 font-semibold">
            Picks locked for {selectedDayInfo?.label} (noon ET passed)
          </p>
        )}

        {statusMessage && (
          <p className={`mt-6 text-center text-lg font-medium ${statusMessage.includes('not') ? 'text-red-600' : 'text-[#2A6A5E]'}`}>
            {statusMessage}
          </p>
        )}

        <div className="w-full max-w-5xl mt-16 overflow-x-auto">
          <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">Standings & Picks</h2>
          {loading ? (
            <p className="text-center text-gray-600">Loading picks...</p>
          ) : (
            <table className="w-full bg-white/90 rounded-xl overflow-hidden shadow-md">
              <thead className="bg-[#2A6A5E] text-white">
                <tr>
                  <th className="py-4 px-5 text-left">Name</th>
                  <th className="py-4 px-5">Status</th>
                  <th className="py-4 px-5 text-center">Avg Days</th>
                  {pickDates.map((d) => (
                    <th key={d.day} className="py-4 px-5 text-center">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedParticipants.map((entry) => {
                  const isOwn = entry.shortName === currentShortName;
                  const visible = isOwn || forceRevealed || isAdmin;
                  const isDead = entry.status === 'eliminated';

                  const avg = averageDaysSurvived[entry.fullName];
                  let avgClass = "text-gray-600";
                  if (avg >= 4.5) avgClass = "text-green-700 font-semibold";
                  else if (avg >= 3.5) avgClass = "text-emerald-600 font-medium";
                  else if (avg >= 2.5) avgClass = "text-amber-700";
                  else avgClass = "text-gray-500";

                  return (
                    <tr key={entry.fullName} className={`border-b hover:bg-gray-50/70 ${isDead ? 'bg-red-50/50 opacity-75' : ''}`}>
                      <td className={`py-4 px-5 font-medium ${isDead ? 'text-red-600 font-bold' : 'text-gray-800'}`}>
                        {entry.fullName}
                      </td>
                      <td className="py-4 px-5 font-medium flex items-center">
                        {isDead ? (
                          <span className="text-red-600 font-bold">Dead</span>
                        ) : (
                          <span className="text-green-600">Alive</span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <span className={avgClass}>
                          {avg ? avg.toFixed(1) : '—'}
                        </span>
                      </td>
                      {pickDates.map((d) => {
                        const dayRound = `Day ${d.day}`;
                        const dayPassed = new Date(d.noonET) <= new Date();
                        const cellVisible = visible || dayPassed || isAdmin;

                        const pick = getPickForDay(entry.picks, dayRound);
                        let displayPick: string | JSX.Element = pick;
                        let pickClass = getPickColor(pick, dayRound);

                        if (pick === '—' && dayPassed) {
                          displayPick = <span className="text-red-600 font-bold">SHAME</span>;
                        }

                        const isEditing = isAdmin && editingCell?.name === entry.shortName && editingCell?.round === dayRound;

                        return (
                          <td
                            key={d.day}
                            className={`py-4 px-5 text-center font-semibold cursor-pointer ${cellVisible ? pickClass : 'bg-gray-200 text-transparent blur-sm select-none'} ${isDead ? 'line-through text-gray-500' : ''}`}
                            onClick={() => {
                              if (isAdmin && cellVisible && !isEditing) {
                                setEditingCell({ name: entry.shortName, round: dayRound });
                              }
                            }}
                          >
                            {isEditing ? (
                              <select
                                autoFocus
                                value={pick}
                                onChange={async (e) => {
                                  const newTeam = e.target.value;
                                  if (!newTeam) {
                                    setEditingCell(null);
                                    return;
                                  }

                                  const alreadyPicked = entry.picks.some((p: Pick) => p.team === newTeam && p.round !== dayRound);
                                  if (alreadyPicked) {
                                    alert(`Already picked ${newTeam} on another day`);
                                    setEditingCell(null);
                                    return;
                                  }

                                  try {
                                    const ref = collection(db, 'picks');
                                    const q = query(ref, where('name', '==', entry.shortName), where('round', '==', dayRound));
                                    const existing = await getDocs(q);

                                    if (!existing.empty) {
                                      await updateDoc(doc(db, 'picks', existing.docs[0].id), {
                                        team: newTeam,
                                        timestamp: serverTimestamp(),
                                        createdAt: new Date().toISOString(),
                                      });
                                    } else {
                                      await addDoc(ref, {
                                        name: entry.shortName,
                                        team: newTeam,
                                        round: dayRound,
                                        timestamp: serverTimestamp(),
                                        createdAt: new Date().toISOString(),
                                      });
                                    }

                                    setStatusMessage(`Updated ${entry.fullName}'s pick for ${dayRound}`);
                                    setTimeout(() => setStatusMessage(''), 3000);
                                  } catch (err: any) {
                                    setStatusMessage('Update failed: ' + err.message);
                                  }

                                  setEditingCell(null);
                                }}
                                onBlur={() => setEditingCell(null)}
                                className="w-full text-center bg-white border border-gray-300 rounded px-1 py-0.5"
                              >
                                <option value="">—</option>
                                {availableTeams.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={pickClass}>{displayPick}</span>
                            )}
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

        <footer className="mt-20 text-gray-600 text-sm">
          Created by Mike Schwartz • Royal Oak, MI
        </footer>
      </main>
    </>
  );
}