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
        const res = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateStr}&groups=50&limit=500`
        );
        if (res.ok) {
          const data = await res.json();
          allEvents = [...allEvents, ...(data.events || [])];
        }
      }

      const formatted = allEvents.map((e: any) => {
        const comp = e.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return null;

        const hr = Number(home.curatedRank?.current);
        const ar = Number(away.curatedRank?.current);

        return {
          gameId: e.id,
          homeTeam: {
            name: home.team.shortDisplayName || home.team.displayName || '',
            score: home.score || '—',
            rank: !isNaN(hr) && hr >= 1 && hr <= 25 ? hr : '',
          },
          awayTeam: {
            name: away.team.shortDisplayName || away.team.displayName || '',
            score: away.score || '—',
            rank: !isNaN(ar) && ar >= 1 && ar <= 25 ? ar : '',
          },
          status: comp.status.type.description || 'Scheduled',
          clock: comp.status.displayClock || '',
          date: new Date(comp.date).toLocaleDateString('en-CA'),
          startTime: comp.date,
        };
      }).filter(Boolean) as Game[];

      setGames(formatted.filter(g => {
        const desc = g.status.toLowerCase();
        return !desc.includes('final') && !desc.includes('end') && (g.homeTeam.rank || g.awayTeam.rank);
      }));
    } catch (err) {
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
  const [editingCell, setEditingCell] = useState<{ name: string; round: string } | null>(null);

  const shortName = `${firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase()} ${lastInitial.trim().toUpperCase()}`.trim();

  useEffect(() => {
    const fetchScores = async () => {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const dates = [today.toISOString().split('T')[0].replace(/-/g, ''), tomorrow.toISOString().split('T')[0].replace(/-/g, '')];

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
          date: new Date(comp.date).toLocaleDateString('en-CA'),
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

      const users = participantFullNames.map(fullName => {
        const short = getShortName(fullName);
        const existing = grouped.get(short) || [];
        return {
          name: short,
          fullName,
          picks: existing.sort((a: Pick, b: Pick) => (a.createdAt || '0').localeCompare(b.createdAt || '0')),
          status: existing.some((p: Pick) => p.status === 'eliminated') ? 'eliminated' : 'alive',
        };
      });

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

        const dayOffset = Number(pick.round.replace('Day ', '')) - 1;
        const pickDate = new Date();
        pickDate.setDate(pickDate.getDate() + dayOffset);
        const pickDateStr = pickDate.toLocaleDateString('en-CA');

        const game = scoreboard.find(g => g.date === pickDateStr &&
          (normalizeTeamName(g.homeTeam.name).includes(normalizeTeamName(pick.team)) ||
           normalizeTeamName(g.awayTeam.name).includes(normalizeTeamName(pick.team)))
        );

        if (!game) return;

        const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('end');
        if (!isFinal) return;

        const h = Number(game.homeTeam.score) || 0;
        const a = Number(game.awayTeam.score) || 0;
        if (h === 0 && a === 0) return;

        const isHome = normalizeTeamName(game.homeTeam.name).includes(normalizeTeamName(pick.team));
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
      setStatusMessage('Admin mode activated — click any pick cell to edit');
      setFirstName(''); setLastInitial('');
      return;
    }

    const allowed = participantFullNames.some(f => getShortName(f) === shortName);
    if (!allowed) {
      setStatusMessage('Name not recognized — check spelling');
      return;
    }

    const user = allUsers.find(u => u.name === shortName);
    if (user?.status === 'eliminated') {
      setStatusMessage('You are eliminated');
      return;
    }

    const today = new Date();
    const dayOffset = currentDay - 1;
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() + dayOffset);
    const noon = new Date(dayDate);
    noon.setHours(12, 0, 0, 0);

    if (new Date() >= noon) {
      setStatusMessage('Picks locked for this day (noon ET passed)');
      return;
    }

    if (usedTeams.includes(selectedTeam)) {
      setStatusMessage(`You already picked ${selectedTeam}`);
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

  const handleAdminEdit = async (userName: string, round: string, newTeam: string) => {
    if (!newTeam) {
      setEditingCell(null);
      return;
    }

    const user = allUsers.find(u => u.name === userName);
    if (!user) return;

    const alreadyUsed = user.picks.some((p: Pick) => p.team === newTeam && p.round !== round);
    if (alreadyUsed) {
      setStatusMessage(`Cannot assign ${newTeam} — already used by ${userName} on another day`);
      setEditingCell(null);
      return;
    }

    try {
      const q = query(collection(db, 'picks'), where('name', '==', userName), where('round', '==', round));
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, 'picks', existing.docs[0].id), {
          team: newTeam,
          timestamp: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'picks'), {
          name: userName,
          team: newTeam,
          round,
          timestamp: serverTimestamp(),
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
      }

      setStatusMessage(`Updated ${userName}'s ${round} to ${newTeam}`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setStatusMessage('Save failed: ' + err.message);
    }

    setEditingCell(null);
  };

  const today = new Date();
  const dayOffset = currentDay - 1;
  const dayDate = new Date(today);
  dayDate.setDate(today.getDate() + dayOffset);
  const dayStr = dayDate.toLocaleDateString('en-CA');

  const dayGames = scoreboard.filter(g => g.date === dayStr);
  const availableTeams = [...new Set(dayGames.flatMap(g => [g.homeTeam.name, g.awayTeam.name].filter(Boolean)))].sort((a,b)=>a.localeCompare(b));

  const myUser = allUsers.find(u => u.name === shortName);
  const isEliminated = myUser?.status === 'eliminated';

  const noon = new Date(dayDate);
  noon.setHours(12, 0, 0, 0);
  const dayLocked = new Date() >= noon;

  const todayLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tomorrowLabel = new Date(today); tomorrowLabel.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrowLabel.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <>
      <style jsx global>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { animation: marquee 70s linear infinite; }
        .heartbeat-alive { display: inline-block; width: 60px; height: 20px; margin-left: 8px; vertical-align: middle; }
        .heartbeat-alive svg { width: 100%; height: 100%; }
        .heartbeat-alive .pulse { animation: heartbeat 1.4s infinite ease-in-out; stroke: #22c55e; stroke-width: 3; fill: none; }
        @keyframes heartbeat {
          0%, 100% { d: path("M0 10 L10 10 L15 2 L20 18 L25 10 L35 10"); }
          40% { d: path("M0 10 L10 10 L13 4 L17 16 L21 10 L35 10"); }
          60% { d: path("M0 10 L10 10 L14 6 L18 14 L22 10 L35 10"); }
        }
        .flatline-dead { display: inline-block; width: 60px; height: 20px; margin-left: 8px; vertical-align: middle; border-bottom: 3px solid #ef4444; }
      `}</style>

      <LiveTicker />

      <main className="min-h-screen bg-[#f5f5f5] pt-28 pb-12 px-4 md:px-8 flex flex-col items-center">
        <Image src="https://upload.wikimedia.org/wikipedia/commons/2/28/March_Madness_logo.svg" alt="March Madness" width={400} height={200} className="mb-6 rounded-lg" priority />

        <h1 className="text-4xl md:text-5xl font-bold text-[#2A6A5E] text-center mb-2">NCAA Survivor Pool</h1>
        <p className="text-xl text-gray-700 text-center mb-8 max-w-2xl">Pick one team per day — no repeats — last one standing wins</p>

        <div className="flex justify-center gap-4 mb-8">
          <input placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} className="px-4 py-2 border rounded w-52" />
          <input placeholder="L" maxLength={1} value={lastInitial} onChange={e => setLastInitial(e.target.value.toUpperCase().slice(0,1))} className="w-14 text-center px-2 py-2 border rounded" />
        </div>

        {isAdmin && <p className="text-center text-purple-700 font-bold mb-6">ADMIN MODE ACTIVE — click any pick cell to edit</p>}

        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button onClick={() => setCurrentDay(1)} className={`px-6 py-2 rounded-full ${currentDay === 1 ? 'bg-[#2A6A5E] text-white' : 'bg-gray-200'}`}>{todayLabel}</button>
          <button onClick={() => setCurrentDay(2)} className={`px-6 py-2 rounded-full ${currentDay === 2 ? 'bg-[#2A6A5E] text-white' : 'bg-gray-200'}`}>{tomorrowStr}</button>
        </div>

        <div className="flex flex-wrap justify-center gap-3 max-w-5xl mb-10">
          {availableTeams.length === 0 ? (
            <p className="text-gray-500 italic">No games found for this date yet...</p>
          ) : (
            availableTeams.map(team => {
              const disabled = usedTeams.includes(team) || dayLocked || isEliminated;
              return (
                <button
                  key={team}
                  onClick={() => !disabled && setSelectedTeam(team)}
                  disabled={disabled}
                  className={`px-6 py-3 border-2 border-[#2A6A5E] rounded-lg min-w-[160px] ${selectedTeam === team ? 'bg-[#2A6A5E] text-white shadow-md' : 'bg-white text-[#2A6A5E] hover:bg-gray-50'} ${disabled ? 'opacity-60 line-through bg-gray-100 cursor-not-allowed' : ''}`}
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
          className="w-full max-w-md bg-[#2A6A5E] text-white py-4 rounded-xl text-xl hover:bg-[#1e4c43] disabled:opacity-50 shadow"
        >
          {dayLocked ? 'Locked' : isEliminated ? 'Eliminated' : 'Submit Pick'}
        </button>

        {statusMessage && <p className={`mt-6 text-center text-lg ${statusMessage.includes('Error') || statusMessage.includes('locked') ? 'text-red-600' : 'text-[#2A6A5E]'}`}>{statusMessage}</p>}

        <div className="w-full max-w-5xl mt-16 flex justify-center">
          <div className="overflow-x-auto">
            <h2 className="text-3xl font-bold text-[#2A6A5E] mb-6 text-center">Standings & Picks</h2>
            {loading ? (
              <p className="text-center text-gray-600">Loading...</p>
            ) : (
              <table className="bg-white rounded-lg shadow overflow-hidden min-w-[800px]">
                <thead className="bg-[#2A6A5E] text-white">
                  <tr>
                    <th className="py-4 px-6 text-left">Name</th>
                    <th className="py-4 px-6 text-center">Status</th>
                    <th className="py-4 px-6 text-center">{todayLabel}</th>
                    <th className="py-4 px-6 text-center">{tomorrowStr}</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(user => {
                    const isMe = user.name === shortName;
                    const visible = isMe || isAdmin;
                    const isDead = user.status === 'eliminated';

                    return (
                      <tr key={user.name} className={`border-b hover:bg-gray-50 ${isDead ? 'bg-red-50 opacity-80' : ''}`}>
                        <td className={`py-4 px-6 font-medium ${isDead ? 'text-red-600 line-through' : 'text-gray-800'}`}>
                          {user.name}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {isDead ? (
                            <>
                              <span className="text-red-600 font-bold">Dead</span>
                              <div className="flatline-dead" />
                            </>
                          ) : (
                            <>
                              <span className="text-green-600 font-bold">Alive</span>
                              <div className="heartbeat-alive">
                                <svg viewBox="0 0 35 20">
                                  <path className="pulse" d="M0 10 L10 10 L15 2 L20 18 L25 10 L35 10" />
                                </svg>
                              </div>
                            </>
                          )}
                        </td>
                        {[1, 2].map(d => {
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

                          const isEditing = isAdmin && editingCell?.name === user.name && editingCell?.round === round;

                          return (
                            <td
                              key={d}
                              className={`py-4 px-6 text-center font-semibold cursor-pointer ${visible ? cellClass : 'bg-gray-200 text-transparent blur-sm'}`}
                              onClick={() => {
                                if (isAdmin && visible && !isEditing) {
                                  setEditingCell({ name: user.name, round });
                                }
                              }}
                            >
                              {isEditing ? (
                                <select
                                  autoFocus
                                  defaultValue={pickTeam}
                                  onChange={(e) => handleAdminEdit(user.name, round, e.target.value)}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-full text-center border border-gray-300 rounded px-2 py-1 bg-white"
                                >
                                  <option value="">— Clear —</option>
                                  {availableTeams.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              ) : visible ? (
                                display
                              ) : (
                                '█████'
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
        </div>

        <footer className="mt-20 text-gray-600 text-sm text-center">Created by Mike Schwartz • Troy, MI</footer>
      </main>
    </>
  );
}