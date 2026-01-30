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

/* =======================
   AVERAGE SURVIVAL DAYS
   ======================= */
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

interface Game {
  gameId: string;
  homeTeam: { name: string; score: string; rank: string | number };
  awayTeam: { name: string; score: string; rank: string | number };
  status: string;
  clock: string;
  date?: string;
}

/* =======================
   LIVE TICKER
   ======================= */
function LiveTicker() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async () => {
    try {
      const res = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      const formatted: Game[] = (data.events || [])
        .map((e: any) => {
          const comp = e.competitions[0];
          const home = comp.competitors.find((c: any) => c.homeAway === 'home');
          const away = comp.competitors.find((c: any) => c.homeAway === 'away');
          const startDate = comp.date
            ? new Date(comp.date).toLocaleDateString('en-CA')
            : '';

          return {
            gameId: e.id,
            homeTeam: {
              name: home?.team.shortDisplayName || '',
              score: home?.score || '—',
              rank: home?.curatedRank?.current || '',
            },
            awayTeam: {
              name: away?.team.shortDisplayName || '',
              score: away?.score || '—',
              rank: away?.curatedRank?.current || '',
            },
            status: comp.status.type.description || 'Unknown',
            clock: comp.status.displayClock || '',
            date: startDate,
          };
        })
        .filter((g: Game) => g.homeTeam.name && g.awayTeam.name);

      setGames(formatted);
      setError(null);
    } catch {
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 45000);
    return () => clearInterval(interval);
  }, []);

  if (error)
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 text-center font-medium">
        {error}
      </div>
    );

  if (!games.length)
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 text-center font-medium">
        No games scheduled/live right now
      </div>
    );

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 overflow-hidden shadow-lg">
      <div className="inline-flex animate-marquee gap-12 whitespace-nowrap">
        {games.concat(games).map((g, i) => (
          <span key={i} className="font-medium">
            {g.homeTeam.rank && `#${g.homeTeam.rank} `}
            {g.homeTeam.name} {g.homeTeam.score} @
            {g.awayTeam.rank && ` #${g.awayTeam.rank} `}
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

/* =======================
   DAYS
   ======================= */
const testDays = [
  { day: 1, label: 'Fri Jan 30', date: '2026-01-30', noonET: '2026-01-30T12:00:00-05:00' },
  { day: 2, label: 'Sat Jan 31', date: '2026-01-31', noonET: '2026-01-31T12:00:00-05:00' },
];

export default function Home() {
  /* ---- ALL YOUR EXISTING STATE + LOGIC IS UNCHANGED ---- */

  // (snipped only in explanation — the code below is untouched)

  // … everything remains the same up to the table …

  /* =======================
     TABLE
     ======================= */
  // ⬇️ Only this section changed
  return (
    <>
      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee 80s linear infinite;
        }
      `}</style>

      <LiveTicker />

      {/* --- main content unchanged --- */}

      <div className="w-full max-w-4xl mt-16 overflow-x-auto">
        <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">
          Standings & Picks
        </h2>

        <table className="w-full bg-white/90 rounded-xl overflow-hidden shadow-md">
          <thead className="bg-[#2A6A5E] text-white">
            <tr>
              <th className="py-4 px-5 text-left">Name</th>
              <th className="py-4 px-5">Avg Days</th>
              <th className="py-4 px-5">Status</th>
              {testDays.map(d => (
                <th key={d.day} className="py-4 px-5 text-center">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedParticipants.map(entry => (
              <tr key={entry.fullName} className="border-b hover:bg-gray-50/70">
                <td className="py-4 px-5 font-medium text-gray-800">
                  {entry.fullName}
                </td>

                {/* ✅ NEW AVG COLUMN */}
                <td className="py-4 px-5 text-center font-semibold text-gray-700">
                  {avgSurvivalDays[entry.fullName] ?? '—'}
                </td>

                {/* --- rest unchanged --- */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
