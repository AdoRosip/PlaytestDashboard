import type { Category } from '../types';
import type { GameConfig } from './types';

// ---------------------------------------------------------------------------
// Exovia — the original factory-building playtest. Rating-heavy form.
// These constants were previously module-level in lib/parser.ts, the overview
// page, and lib/filtering.ts; they now live here so the game is swappable.
// ---------------------------------------------------------------------------

const categories: Category[] = [
  { id: 'cat_01', projectId: 'proj_import', name: 'Player Background',            description: 'Gaming history and genre experience — used as a segmentation lens', order: 1,  color: '#00FFFF' },
  { id: 'cat_02', projectId: 'proj_import', name: 'Overall Experience',           description: 'Enjoyment, frustration, favourite moments, and session length', order: 2,  color: '#0066FF' },
  { id: 'cat_03', projectId: 'proj_import', name: 'Retention & Market Fit',       description: 'Replay intent, NPS, and what makes the game stand out', order: 3,  color: '#6366F1' },
  { id: 'cat_04', projectId: 'proj_import', name: 'Game Clarity & Onboarding',   description: 'Mechanic comprehension, objectives, guidance, and feeling stuck', order: 4,  color: '#0000EE' },
  { id: 'cat_05', projectId: 'proj_import', name: 'Progression & Engagement',    description: 'Progress depth, pacing, stopping reasons, and peak excitement', order: 5,  color: '#FFF' },
  { id: 'cat_06', projectId: 'proj_import', name: 'Core Mechanics',              description: 'Zero-gravity movement and laser mining feel', order: 6,  color: '#00FFFF' },
  { id: 'cat_07', projectId: 'proj_import', name: 'Automation & Factory Systems',description: 'Logistics, resource transport, automation satisfaction', order: 7,  color: '#0066FF' },
  { id: 'cat_08', projectId: 'proj_import', name: 'UI & Quality of Life',        description: 'Interface clarity, menu navigation, and QoL requests', order: 8,  color: '#6366F1' },
  { id: 'cat_09', projectId: 'proj_import', name: 'Technical & Evidence',        description: 'Performance issues, bugs, and gameplay recordings', order: 9,  color: '#0000EE' },
  { id: 'cat_15', projectId: 'proj_import', name: 'Admin / Internal',            description: 'Internal scoring and payment data — excluded from report', order: 10, color: '#334155' },
];

const categoryRules: [string, RegExp][] = [
  // Admin / Internal (must come first — catch evaluation score, amount, empty cols)
  ['cat_15', /evaluation.?score|admin.?note|__empty|amount/i],

  // Technical & Evidence (performance, recordings, uploads)
  ['cat_09', /record.*(gameplay|image)|upload|footage|timestamp.*(confused|frustrated|stuck|exciting)|notes.*file|files.*upload|performance.?issue|fps.?drop|stuttering|floater.*fps|explosions/i],

  // Player Background
  ['cat_01', /similar.?game|which.*game.*played|hours.*factorio|hours.*satisfactory|factorio|satisfactory/i],

  // Core Mechanics — Zero Gravity & Mining
  ['cat_06', /zero.?gravity|navigating.*zero|movement.*disorienting|disorienting.*difficult|improve.*movement|movement.*improve|mining.?ore|laser.*mining|mining.*laser|mining.*repetitive|repetitive.*mining|improve.*mining|mining.*improve/i],

  // Automation & Factory Systems (logistics + automation + space transport)
  ['cat_07', /automated.?system.*work.?together|floater.?management|accelerator|resources.*flow|visually.?reward|logistics.*resource.*transport|resource.*transport.*system|managing.*moving.*resource|moving.*resources/i],

  // UI & Quality of Life
  ['cat_08', /user.?interface.*overall|navigate.*menu|menu.*navigat|parts.*user.?interface|quality.?of.?life/i],

  // Game Clarity & Onboarding (mechanics, objectives, guidance, stuck, trial-error)
  ['cat_04', /game.?mechanic.*overall|mechanic.*unclear|mechanic.*confus|new.?mechanic.*introduced|help.*understand|objective.*instruction|instruction.*manual|audio.?log|what.*looking.?for|stuck.*unsure.*progress|unsure.*how.*progress|caused.*this.*feeling|when.*this.*happened|intuitive.*trial|trial.*error/i],

  // Progression & Engagement (progress system, tier reached, pacing, factory growth)
  ['cat_05', /progression.?system|how.?far.*progress|stopped.?progress|pacing.*unlock|factory.?automat.*evolv|automat.*evolv|most.?exciting/i],

  // Retention & Market Fit (continue, recommend, stand out, why continue/stop)
  ['cat_03', /continue.*playing.*test|recommend.*friend|stand.?out.?compared|continue.*or.*stop|want.*to.*continue/i],

  // Overall Experience (enjoyment, frustration, quit moments, favourite part, hours)
  ['cat_02', /enjoy.*game.*overall|playtest.*stopped|stopped.*playing|frustrated.*confused.*bored|friction.*frustration|friction.*unnecessary|how.?many.?hours.*play|favourite|favorite/i],
];

const inverseScoringPatterns: RegExp[] = [
  /feel\s+frustrated|frustrated.*confused.*bored|quitting the game/i, // frequency of frustration / boredom / quitting
  /friction|unnecessary frustration/i,                               // friction / frustration during gameplay
  /disorienting|disorient/i,                                         // movement felt disorienting or difficult
  /repetitive/i,                                                     // mining became repetitive too quickly
  /feel stuck|stuck or unsure|unsure how to progress/i,             // feeling stuck / unable to progress
];

export const exoviaConfig: GameConfig = {
  id: 'exovia',
  gameName: 'Exovia',
  categories,
  categoryRules,
  inverseScoringPatterns,
  kpis: [
    { key: 'enjoy',   label: 'Overall Satisfaction',    pattern: /enjoy.*overall|overall.*enjoy/i,       scaleMax: 5 },
    { key: 'clarity', label: 'Gameplay Clarity',        pattern: /game.?mechanic.*overall|how.*intuitive/i, scaleMax: 5 },
    { key: 'retention', label: 'Want to Continue Playing', pattern: /continue.*playing/i,                 scaleMax: 5 },
    { key: 'nps',     label: 'Would Recommend',         pattern: /recommend.*friend/i,                    scaleMax: 5 },
  ],
  filters: {
    sessionPlaytime: /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)/i,
    enjoyOverall: /enjoy.*overall|overall.*enjoy/i,
    backgroundCategoryId: 'cat_01',
    priorGames: [
      { key: 'factorio',     label: 'Played Factorio',     pattern: /factorio/i },
      { key: 'satisfactory', label: 'Played Satisfactory', pattern: /satisfactory/i },
    ],
  },
  // Factory-building / automation sim.
  targetGenres: [
    { label: 'Strategy / Tactical',  match: /strategy|tactical/i },
    { label: 'Simulation / Cozy',    match: /simulation|cozy/i },
    { label: 'Sandbox / Open-World', match: /sandbox|open.?world/i },
  ],
  overviewMode: 'scoring',
};
