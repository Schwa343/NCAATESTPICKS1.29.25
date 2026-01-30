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
  date?: string;
}

/* ---------------- AVERAGES ---------------- */
const avgSurvivalDays: Record<string, number> = {
  'Patrick Gifford': 4.4,
  'Garret Gotaas': 2.8,
  'Mike Schwartz': 3.5,
  'Derrick Defever': 2.9,
  'Matt Syzmanski': 4.1,
  'Connor Giroux': 3.1,
  'Nick Dahl': 4.4,
  'Chris Canada': 2.9,
  'Brian Burger': 4.0,
  'Rich Deward': 4.4,
  'Peter Murray': 3.1,
  'Spenser Pawlik': 3.7,
  'Nick Mowid': 3.4,
  'James Conway': 3.3,
  'Tom Strobel': 1.0,
  'Zak Burns': 1.4,
  'Alex McAdoo': 5.0,
  'Sean Falvey': 4.0,
  'Tyler Decoster': 6.5,
  'Mike Gallagher': 1.0,
};
/* ------------------------------------------ */

/* ---------------- LIVE TICKER (unchanged) ---------------- */
function LiveTicker() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async () => {
    try {
      const res = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=50&limit=500'
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      const formatted: Game[] = (data.events || [])
        .map((e: any) => {
          const comp = e.competitions?.[0];
          const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
          const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
          if (!home || !away) return null;

          return {
            gameId: e.id,
            homeTeam: {
              name: home.team.shortDisplayName,
              score: home.score || '—',
              rank: home.curatedRank?.current || '',
            },
            awayTeam: {
              name: away.team.shortDisplayName,
              score: away.score || '—',
              rank: away.curatedRank?.current || '',
            },
            status: comp.status.type.description || '',
            clock: comp.status.displayClock || '',
          };
        })
        .filter(Boolean);

      const upcomingOrLive = formatted.filter((g) => {
        const s = g.status.toLowerCase();
        return !s.includes('final') && !s.includes('complete');
      });

      setGames(upcomingOrLive);
      setError(null);
    } catch {
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const i = setInterval(fetchScores, 45000);
    return () => clearInterval(i);
  }, []);

  if (error)
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 text-center">
        {error}
      </div>
    );

  if (!games.length)
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 text-center">
        No live or upcoming games right now
      </div>
    );

  const displayGames = [...games, ...games];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 overflow-hidden">
      <style jsx global>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 50s linear infinite;
        }
      `}</style>

      <div className="inline-flex animate-marquee gap-12 whitespace-nowrap">
        {displayGames.map((g, i) => (
          <span key={i}>
            {g.homeTeam.rank ? `#${g.homeTeam.rank} ` : ''}
            {g.homeTeam.name} {g.homeTeam.score} @
            {g.awayTeam.rank ? ` #${g.awayTeam.rank} ` : ' '}
            {g.awayTeam.name} {g.awayTeam.score}{' '}
            <span className="text-yellow-300 font-semibold">
              {g.status} {g.clock && `(${g.clock})`}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
/* ---------------------------------------------------------- */

/* ---------------- DAYS ---------------- */
const testDays = [
  { day: 1, label: 'Fri Jan 30', date: '2026-01-30', noonET: '2026-01-30T12:00:00-05:00' },
  { day: 2, label: 'Sat Jan 31', date: '2026-01-31', noonET: '2026-01-31T12:00:00-05:00' },
];

export default function Home() {
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [userPicks, setUserPicks] = useState<any[]>([]);
  const [scoreboard, setScoreboard] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [forceRevealed, setForceRevealed] = useState(false);
  const [currentDay, setCurrentDay] = useState(1);
  const [nameLocked, setNameLocked] = useState(false);
  const [usedTeams, setUsedTeams] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const participantNames = [
    'Patrick Gifford',
    'Garret Gotaas',
    'Mike Schwartz',
    'Derrick Defever',
    'Matt Syzmanski',
    'Connor Giroux',
    'Nick Dahl',
    'Chris Canada',
    'Brian Burger',
    'Rich Deward',
    'Peter Murray',
    'Spenser Pawlik',
    'Nick Mowid',
    'James Conway',
    'Tom Strobel',
    'Zak Burns',
    'Tyler Decoster',
  ];

  const getShortName = (full: string) => {
    const p = full.split(' ');
    return `${p[0]} ${p[p.length - 1][0]}`;
  };

  const currentShortName = `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()} ${lastInitial.toUpperCase()}`.trim();

  /* ---------------- PICKS LISTENER (unchanged) ---------------- */
  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      const grouped = new Map<string, any[]>();
      all.forEach((p) => {
        if (!grouped.has(p.name)) grouped.set(p.name, []);
        grouped.get(p.name)!.push(p);
      });
      setUserPicks(
        Array.from(grouped.entries()).map(([name, picks]) => ({
          name,
          picks,
          status: picks.some((p) => p.status === 'eliminated') ? 'eliminated' : 'alive',
        }))
      );
      setLoading(false);
    });
  }, []);

  /* ---------------- DISPLAYED PARTICIPANTS (UPDATED) ---------------- */
  const displayedParticipants = participantNames
    .map((full) => {
      const short = getShortName(full);
      const user = userPicks.find((u) => u.name === short) || { picks: [], status: 'alive' };
      return {
        fullName: full,
        shortName: short,
        picks: user.picks,
        status: user.status,
        avgDays: avgSurvivalDays[full] ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <>
      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] flex flex-col items-center pt-28 px-4">
        <h1 className="text-4xl font-bold text-[#2A6A5E] mb-8">
          NCAA Survivor Pool – Test Week
        </h1>

        <div className="w-full max-w-5xl overflow-x-auto">
          <table className="w-full bg-white rounded-xl shadow">
            <thead className="bg-[#2A6A5E] text-white">
              <tr>
                <th className="py-4 px-5 text-left">Name</th>
                <th className="py-4 px-5 text-center">Avg Days</th>
                <th className="py-4 px-5">Status</th>
                {testDays.map((d) => (
                  <th key={d.day} className="py-4 px-5 text-center">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedParticipants.map((e) => (
                <tr key={e.fullName} className="border-b">
                  <td className="py-4 px-5 font-medium">{e.fullName}</td>
                  <td className="py-4 px-5 text-center font-medium text-gray-700">
                    {e.avgDays !== null ? e.avgDays.toFixed(1) : '—'}
                  </td>
                  <td className="py-4 px-5">
                    {e.status === 'eliminated' ? (
                      <span className="text-red-600 font-bold">Dead</span>
                    ) : (
                      <span className="text-green-600">Alive</span>
                    )}
                  </td>
                  {testDays.map((d) => (
                    <td key={d.day} className="py-4 px-5 text-center">
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
