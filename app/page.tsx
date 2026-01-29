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
  date?: string; // YYYY-MM-DD
}

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

      const formatted = (data.events || []).map((e: any) => {
        const comp = e.competitions[0];
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');

        const homeScore = Number(home?.score) || 0;
        const awayScore = Number(away?.score) || 0;

        const startDate = comp.date ? new Date(comp.date).toLocaleDateString('en-CA') : '';

        return {
          gameId: e.id,
          homeTeam: { name: home?.team.shortDisplayName || '', score: home?.score || '—', rank: home?.curatedRank?.current || '' },
          awayTeam: { name: away?.team.shortDisplayName || '', score: away?.score || '—', rank: away?.curatedRank?.current || '' },
          status: comp.status.type.description || 'Unknown',
          clock: comp.status.displayClock || '',
          date: startDate,
        };
      }).filter(g => g.homeTeam.name && g.awayTeam.name);

      setGames(formatted);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Live scores unavailable');
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 45000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="fixed top-0 left-0 right-0 z-50 bg-red-800 text-white py-3 px-4 text-center font-medium">{error}</div>;
  if (games.length === 0) return <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white py-3 px-4 text-center font-medium">No games scheduled/live right now</div>;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#2A6A5E] text-white py-3 px-4 overflow-hidden whitespace-nowrap shadow-lg">
      <div className="inline-flex animate-marquee gap-12">
        {games.concat(games).map((game, i) => (
          <span key={i} className="font-medium">
            {game.homeTeam.rank ? `#${game.homeTeam.rank} ` : ''}{game.homeTeam.name} {game.homeTeam.score} @
            {game.awayTeam.rank ? `#${game.awayTeam.rank} ` : ''}{game.awayTeam.name} {game.awayTeam.score}{' '}
            <span className="text-yellow-300 font-semibold">{game.status} {game.clock && `(${game.clock})`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Friday + Saturday (2025–26 season)
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
  const [currentDay, setCurrentDay] = useState(1); // Friday
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
    'Alex McAdoo',
    'Sean Falvey',
    'Tyler Decoster',
    'Mike Gallagher',
  ];

  const getShortName = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 2) return fullName;
    const first = parts[0];
    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
    return `${first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()} ${lastInitial}`;
  };

  const currentShortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    setHasSubmitted(false);
  }, [currentShortName]);

  // Fetch Friday + Saturday games from collegebasketballdata.com
  useEffect(() => {
    const fetchScores = async () => {
      try {
        // Friday Jan 30 2026
        console.log('Fetching Friday from ESPN (dates=20260130)');
        const fridayRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260130');
        if (!fridayRes.ok) {
          console.error('Friday ESPN status:', fridayRes.status, await fridayRes.text());
          throw new Error('Friday fetch failed');
        }
        const fridayData = await fridayRes.json();
        console.log('Friday events count:', fridayData.events?.length || 0);
        console.log('Friday first event (if any):', fridayData.events?.[0] || 'No events');
  
        // Saturday Jan 31 2026
        console.log('Fetching Saturday from ESPN (dates=20260131)');
        const satRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260131');
        if (!satRes.ok) {
          console.error('Saturday ESPN status:', satRes.status, await satRes.text());
          throw new Error('Saturday fetch failed');
        }
        const satData = await satRes.json();
        console.log('Saturday events count:', satData.events?.length || 0);
        console.log('Saturday first event (if any):', satData.events?.[0] || 'No events');
  
        const allEvents = [...(fridayData.events || []), ...(satData.events || [])];
  
        const formatted = allEvents.map((e: any) => {
          const comp = e.competitions[0];
          const home = comp.competitors.find((c: any) => c.homeAway === 'home');
          const away = comp.competitors.find((c: any) => c.homeAway === 'away');
  
          const startDate = comp.date ? new Date(comp.date).toLocaleDateString('en-CA') : '';
  
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
            status: comp.status.type.description || 'Scheduled',
            clock: comp.status.displayClock || '',
            date: startDate,
          };
        }).filter(g => g.homeTeam.name && g.awayTeam.name);
  
        setScoreboard(formatted);
  
        console.log('Final ESPN games in app:', formatted.map(g => `${g.awayTeam.name} @ ${g.homeTeam.name} on ${g.date} - ${g.status}`));
      } catch (err) {
        console.error('ESPN fetch error:', err);
      }
    };
  
    fetchScores();
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'picks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      const grouped = new Map<string, any[]>();
      all.forEach((pick) => {
        if (!grouped.has(pick.name)) grouped.set(pick.name, []);
        grouped.get(pick.name)!.push(pick);
      });
      const formatted = Array.from(grouped.entries()).map(([name, picks]) => ({
        name,
        picks: picks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        status: picks.some((p) => p.status === 'eliminated') ? 'eliminated' : 'alive',
      }));
      setUserPicks(formatted);
      setLoading(false);
    }, (err) => {
      console.error('Picks fetch error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentShortName) return;
    const user = userPicks.find(u => u.name === currentShortName);
    if (user) {
      setNameLocked(true);
      setUsedTeams(user.picks.map((p: any) => p.team).filter(Boolean));
    }
  }, [currentShortName, userPicks]);

  const isDayLocked = (day: number): boolean => {
    const dayInfo = testDays.find(d => d.day === day);
    if (!dayInfo) return false;
    const noon = new Date(dayInfo.noonET);
    return new Date() >= noon;
  };

  const currentDayLocked = isDayLocked(currentDay);

  const isDeadForDay = (userPicks: any[], dayRound: string) => {
    const pick = userPicks.find(p => p.round === dayRound)?.team;
    if (!pick) return false;

    const game = scoreboard.find(g => 
      g.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(pick.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      g.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(pick.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      pick.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(g.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      pick.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(g.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, ''))
    );

    if (!game) return false;

    const statusLower = game.status.toLowerCase();
    const isFinal = statusLower.includes('final') || statusLower.includes('ended') || statusLower.includes('complete');

    if (!isFinal) return false;

    const homeScore = Number(game.homeTeam.score) || 0;
    const awayScore = Number(game.awayTeam.score) || 0;

    const pickedClean = pick.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const homeClean = game.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const awayClean = game.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '');

    const isHome = homeClean.includes(pickedClean) || pickedClean.includes(homeClean);
    const isAway = awayClean.includes(pickedClean) || pickedClean.includes(awayClean);

    if (isHome) return homeScore < awayScore;
    if (isAway) return awayScore < homeScore;

    return false;
  };

  const handleSubmit = async () => {
    let trimmedFirst = firstName.trim();
    let trimmedInitial = lastInitial.trim().toUpperCase();

    if (!trimmedFirst || trimmedInitial.length !== 1 || !/^[A-Z]$/.test(trimmedInitial)) {
      setStatusMessage('First name + one uppercase initial (A-Z) required');
      return;
    }

    trimmedFirst = trimmedFirst.charAt(0).toUpperCase() + trimmedFirst.slice(1).toLowerCase();
    const shortName = `${trimmedFirst} ${trimmedInitial}`;

    if (trimmedFirst.toLowerCase() === 'stanley' && trimmedInitial === 'S') {
      setForceRevealed(true);
      setStatusMessage('All picks revealed permanently!');
      setTimeout(() => setStatusMessage(''), 3000);
      setFirstName('');
      setLastInitial('');
      return;
    }

    const allowedShortNames = participantNames.map(getShortName);
    if (!allowedShortNames.includes(shortName)) {
      setStatusMessage(`"${shortName}" not recognized — check spelling or ask Mike to add you.`);
      return;
    }

    const round = `Day ${currentDay}`;

    if (currentDayLocked) {
      setStatusMessage(`Picks for ${testDays[currentDay-1].label} are locked — noon ET has passed.`);
      return;
    }

    const user = userPicks.find(u => u.name === shortName);
    if (user && user.status === 'eliminated') {
      setStatusMessage('You are eliminated.');
      return;
    }

    if (usedTeams.includes(selectedTeam)) {
      setStatusMessage(`Already picked ${selectedTeam}.`);
      return;
    }

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

      setStatusMessage(`Saved: ${selectedTeam} for ${testDays[currentDay-1].label}`);
      setSelectedTeam('');
      setNameLocked(true);
      setHasSubmitted(true);
    } catch (err: any) {
      setStatusMessage('Error: ' + err.message);
    }
  };

  const getPickColor = (team: string) => {
    if (!team || team === '—') return 'bg-gray-100 text-gray-800';

    const game = scoreboard.find(g => 
      g.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(team.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      g.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(team.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      team.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(g.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '')) ||
      team.toLowerCase().replace(/[^a-z0-9]/gi, '').includes(g.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, ''))
    );

    if (!game) return 'bg-gray-100 text-gray-800';

    const statusLower = game.status.toLowerCase();
    const isFinal = statusLower.includes('final') || statusLower.includes('ended') || statusLower.includes('complete');

    if (!isFinal) return 'bg-yellow-100 text-yellow-800';

    const homeScore = Number(game.homeTeam.score) || 0;
    const awayScore = Number(game.awayTeam.score) || 0;

    const pickedClean = team.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const homeClean = game.homeTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '');
    const awayClean = game.awayTeam.name.toLowerCase().replace(/[^a-z0-9]/gi, '');

    const isHome = homeClean.includes(pickedClean) || pickedClean.includes(homeClean);
    const isAway = awayClean.includes(pickedClean) || pickedClean.includes(awayClean);

    if (isHome) {
      if (homeScore > awayScore) return 'bg-green-100 text-green-800';
      if (homeScore < awayScore) return 'bg-red-100 text-red-800';
      return 'bg-yellow-100 text-yellow-800';
    }

    if (isAway) {
      if (awayScore > homeScore) return 'bg-green-100 text-green-800';
      if (awayScore < homeScore) return 'bg-red-100 text-red-800';
      return 'bg-yellow-100 text-yellow-800';
    }

    return 'bg-gray-100 text-gray-800';
  };

  const getPickForDay = (picks: any[], round: string) => {
    return picks.find(p => p.round === round)?.team || '—';
  };

  const selectedDayInfo = testDays.find(d => d.day === currentDay);
  const dayGames = scoreboard.filter(g => g.date === selectedDayInfo?.date);
  const availableTeams = [...new Set(
    dayGames.flatMap(g => [g.homeTeam.name, g.awayTeam.name]).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const displayedParticipants = participantNames.map(full => {
    const short = getShortName(full);
    const userData = userPicks.find(u => u.name === short) || { picks: [], status: 'alive' };
    return { fullName: full, shortName: short, picks: userData.picks, status: userData.status };
  }).sort((a,b) => a.fullName.localeCompare(b.fullName));

  return (
    <>
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 80s linear infinite; }
      `}</style>

      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] flex flex-col items-center pt-28 pb-8 px-4 md:px-8">
        <Image src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg" alt="March Madness" width={400} height={200} className="mb-4 rounded-lg" priority />

        <h1 className="text-4xl md:text-5xl font-bold text-[#2A6A5E] mb-4 text-center">NCAA Survivor Pool – Test Week</h1>
        <p className="text-xl text-gray-700 mb-8 text-center max-w-2xl">
          Simulating Rounds 1 & 2: Thu Jan 29 – Sun Feb 1
        </p>

        <div className="mb-8 flex gap-4">
          <input type="text" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} disabled={nameLocked} className="px-4 py-2 border rounded w-48" />
          <input type="text" placeholder="L" maxLength={1} value={lastInitial} onChange={e => setLastInitial(e.target.value.toUpperCase().slice(0,1))} disabled={nameLocked} className="px-3 py-2 border rounded w-14 text-center" />
        </div>

        <div className="mb-8 flex flex-wrap gap-3 justify-center">
          {testDays.map(d => (
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
            <p className="text-gray-500 italic">No games scheduled for {selectedDayInfo?.label} or loading...</p>
          ) : availableTeams.map(team => {
            const isUsed = usedTeams.includes(team);
            return (
              <button
                key={team}
                onClick={() => !isUsed && setSelectedTeam(team)}
                disabled={isUsed || currentDayLocked}
                className={`px-5 py-2.5 min-w-[140px] border-2 border-[#2A6A5E] rounded-lg font-medium transition-all
                  ${selectedTeam === team ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'}
                  ${isUsed || currentDayLocked ? 'opacity-60 line-through cursor-not-allowed bg-gray-100' : ''}`}
              >
                {team}
              </button>
            );
          })}
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
            Picks for {selectedDayInfo?.label} are locked (noon ET passed)
          </p>
        )}

        {statusMessage && (
          <p className={`mt-6 text-center text-lg font-medium ${statusMessage.includes('not recognized') ? 'text-red-600' : 'text-[#2A6A5E]'}`}>
            {statusMessage}
          </p>
        )}

        <div className="w-full max-w-4xl mt-16 overflow-x-auto">
          <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">Standings & Picks</h2>
          {loading ? (
            <p className="text-center text-gray-600">Loading...</p>
          ) : (
            <table className="w-full bg-white/90 rounded-xl overflow-hidden shadow-md">
              <thead className="bg-[#2A6A5E] text-white">
                <tr>
                  <th className="py-4 px-5 text-left">Name</th>
                  <th className="py-4 px-5">Status</th>
                  {testDays.map(d => (
                    <th key={d.day} className="py-4 px-5 text-center">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedParticipants.map(entry => {
                  const isOwn = entry.shortName === currentShortName;
                  const visible = hasSubmitted && isOwn || forceRevealed;

                  const dayRound = `Day ${currentDay}`;
                  const isDead = isDeadForDay(entry.picks, dayRound);

                  return (
                    <tr key={entry.fullName} className="border-b hover:bg-gray-50/70">
                      <td className={`py-4 px-5 font-medium ${isDead ? 'text-red-600 font-bold' : 'text-gray-800'}`}>
                        {entry.fullName}
                      </td>
                      <td className="py-4 px-5 font-medium">
                        {isDead ? (
                          <span className="text-red-600 font-bold">Dead</span>
                        ) : (
                          <span className="text-green-600">Alive</span>
                        )}
                      </td>
                      {testDays.map(d => {
                        const pick = getPickForDay(entry.picks, `Day ${d.day}`);
                        const dayPassedNoon = new Date(d.noonET) <= new Date();
                        const cellVisible = visible || dayPassedNoon;

                        return (
                          <td
                            key={d.day}
                            className={`py-4 px-5 text-center font-semibold ${cellVisible ? getPickColor(pick) : 'bg-gray-200 text-transparent blur-sm select-none'}`}
                          >
                            {cellVisible ? (pick || '—') : '███'}
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

        <footer className="mt-20 text-gray-600 text-sm pb-8">Created by Mike Schwartz • Troy, MI</footer>
      </main>
    </>
  );
}