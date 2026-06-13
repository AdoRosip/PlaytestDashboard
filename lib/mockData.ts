import type {
  Project, Tester, Category, Question, Response, Theme,
} from './types';

export const mockProject: Project = {
  id: 'proj_001',
  name: 'Exovia Playtest Alpha',
  gameName: 'Exovia',
  playtestName: 'Alpha Wave 1 — May 2026',
  createdAt: '2026-05-01T10:00:00Z',
  totalResponses: 7,   // sample size — upload your Excel file for real data
  matchedTesters: 7,
  unmatchedTesters: 0,
};

// ---------------------------------------------------------------------------
// Categories — built specifically around the Exovia Alpha form structure.
// Questions in the form are grouped into these logical areas.
// Follow-up questions (open text that references a prior rating) live in the
// same category as their parent question so the full context stays together.
// ---------------------------------------------------------------------------
export const mockCategories: Category[] = [
  {
    id: 'cat_01', projectId: 'proj_001', order: 1,
    name: 'Tester Background',
    description: 'Gaming history and experience with the automation genre — used as a segmentation lens for all other scores.',
    color: '#00FFFF',
  },
  {
    id: 'cat_02', projectId: 'proj_001', order: 2,
    name: 'Overall Friction & Session',
    description: 'High-level frustration signals, would-they-have-quit moments, total playtime, and first impression of intuitiveness.',
    color: '#0066FF',
  },
  {
    id: 'cat_03', projectId: 'proj_001', order: 3,
    name: 'Mechanics & Clarity',
    description: 'How well core game mechanics were communicated and understood, including how new systems are introduced.',
    color: '#0000EE',
  },
  {
    id: 'cat_04', projectId: 'proj_001', order: 4,
    name: 'Progression & Pacing',
    description: 'Goal clarity, how often players felt stuck, how far they got, and whether the tech unlock pacing felt right.',
    color: '#FFF',
  },
  {
    id: 'cat_05', projectId: 'proj_001', order: 5,
    name: 'Logistics & Resource Transport',
    description: 'Intuitiveness and satisfaction of the logistics and resource-movement system.',
    color: '#00FFFF',
  },
  {
    id: 'cat_06', projectId: 'proj_001', order: 6,
    name: 'User Interface',
    description: 'UI clarity, menu navigation, and quality-of-life improvements testers most want.',
    color: '#0066FF',
  },
  {
    id: 'cat_07', projectId: 'proj_001', order: 7,
    name: 'Objectives & In-Game Guidance',
    description: 'Clarity of goals and instructions, use of the in-game manual / audio log, and what was unclear.',
    color: '#0000EE',
  },
  {
    id: 'cat_08', projectId: 'proj_001', order: 8,
    name: 'Enjoyment & Retention',
    description: 'Overall enjoyment score, NPS, likelihood to continue, and what drives replay intent.',
    color: '#FFF',
  },
  {
    id: 'cat_09', projectId: 'proj_001', order: 9,
    name: 'Zero Gravity Movement',
    description: 'Feel, enjoyment, and disorientation of moving and navigating in the zero-gravity environment.',
    color: '#00FFFF',
  },
  {
    id: 'cat_10', projectId: 'proj_001', order: 10,
    name: 'Mining & Extraction',
    description: 'Satisfaction and repetitiveness of the laser mining mechanic.',
    color: '#0066FF',
  },
  {
    id: 'cat_11', projectId: 'proj_001', order: 11,
    name: 'Automation Systems',
    description: 'Factory-level automation satisfaction — watching systems work together, floater management, accelerators, and evolution over time.',
    color: '#0000EE',
  },
  {
    id: 'cat_12', projectId: 'proj_001', order: 12,
    name: 'Open Highlights & Feedback',
    description: 'Favourite moments, what makes Exovia stand out, and peak excitement points in the session.',
    color: '#FFF',
  },
  {
    id: 'cat_13', projectId: 'proj_001', order: 13,
    name: 'Performance & Bugs',
    description: 'FPS drops, stuttering, floater-related lag, and other technical issues encountered.',
    color: '#00FFFF',
  },
  {
    id: 'cat_14', projectId: 'proj_001', order: 14,
    name: 'Evidence & Recordings',
    description: 'Gameplay footage uploads, external links, and timestamped notes about key moments.',
    color: '#0066FF',
  },
  {
    id: 'cat_15', projectId: 'proj_001', order: 15,
    name: 'Admin / Internal',
    description: 'Internal evaluation score, admin notes, and payment tracking. Not included in client-facing report.',
    color: '#0000EE',
  },
];

// ---------------------------------------------------------------------------
// Questions — all 61 non-meta columns from the Exovia Alpha form.
// IDs match what the parser generates (q_000 … q_060).
// Types are based on actual response data, not just question wording
// (e.g. "Did movement feel disorienting?" uses a 1-5 scale in practice).
// Follow-up questions are noted in the text and share their parent's category.
// ---------------------------------------------------------------------------
export const mockQuestions: Question[] = [
  // ── Tester Background ──────────────────────────────────────────────────
  { id: 'q_000', projectId: 'proj_001', categoryId: 'cat_01', sourceColumn: 'q_000',
    text: 'Have you played similar games to Exovia? (Factory building, management type)',
    type: 'yes_no', responseCount: 177 },

  { id: 'q_001', projectId: 'proj_001', categoryId: 'cat_01', sourceColumn: 'q_001',
    text: 'Which of these games have you played?',
    type: 'multiple_choice', responseCount: 164 },

  { id: 'q_002', projectId: 'proj_001', categoryId: 'cat_01', sourceColumn: 'q_002',
    text: 'How many hours do you have on Factorio?',
    type: 'multiple_choice', responseCount: 158 },

  { id: 'q_003', projectId: 'proj_001', categoryId: 'cat_01', sourceColumn: 'q_003',
    text: 'How many hours do you have on Satisfactory?',
    type: 'multiple_choice', responseCount: 152 },

  // ── Overall Friction & Session ──────────────────────────────────────────
  { id: 'q_004', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_004',
    text: 'If this was not a playtest, would you have stopped playing at any point?',
    type: 'yes_no', responseCount: 177 },

  { id: 'q_005', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_005',
    text: 'How often did you feel frustrated, confused, bored, or like quitting the game?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 2.4, responseCount: 177, lowScorePct: 52 },

  { id: 'q_006', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_006',
    text: '↳ If you had moments like this, what caused them? (follow-up)',
    type: 'free_text', responseCount: 142 },

  { id: 'q_023', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_023',
    text: 'How much friction or unnecessary frustration did you experience during gameplay?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 2.6, responseCount: 177, lowScorePct: 46 },

  { id: 'q_034', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_034',
    text: 'Approximately how many hours did you play?',
    type: 'free_text', responseCount: 177 },

  { id: 'q_036', projectId: 'proj_001', categoryId: 'cat_02', sourceColumn: 'q_036',
    text: 'Did the game feel intuitive, or more like trial and error?',
    type: 'multiple_choice', responseCount: 177 },

  // ── Mechanics & Clarity ─────────────────────────────────────────────────
  { id: 'q_007', projectId: 'proj_001', categoryId: 'cat_03', sourceColumn: 'q_007',
    text: 'How clear and understandable were the game mechanics overall?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.8, responseCount: 177, lowScorePct: 22 },

  { id: 'q_008', projectId: 'proj_001', categoryId: 'cat_03', sourceColumn: 'q_008',
    text: '↳ Which mechanics felt unclear or confusing and why? (follow-up)',
    type: 'free_text', responseCount: 118 },

  { id: 'q_030', projectId: 'proj_001', categoryId: 'cat_03', sourceColumn: 'q_030',
    text: 'How clearly were new mechanics/components introduced?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.5, responseCount: 177, lowScorePct: 28 },

  { id: 'q_031', projectId: 'proj_001', categoryId: 'cat_03', sourceColumn: 'q_031',
    text: '↳ Is there anything that could help you understand it more? (follow-up)',
    type: 'free_text', responseCount: 101 },

  // ── Progression & Pacing ────────────────────────────────────────────────
  { id: 'q_009', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_009',
    text: 'How often did you feel stuck or unsure how to progress?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 2.9, responseCount: 177, lowScorePct: 42 },

  { id: 'q_010', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_010',
    text: '↳ What specifically caused this feeling? (follow-up)',
    type: 'free_text', responseCount: 132 },

  { id: 'q_011', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_011',
    text: '↳ Do you remember approximately when this happened? (follow-up)',
    type: 'free_text', responseCount: 110 },

  { id: 'q_012', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_012',
    text: 'How engaging was the progression system?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.9, responseCount: 177, lowScorePct: 18 },

  { id: 'q_013', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_013',
    text: 'How far did you progress during the session? (which Technology Tier / automation stage)',
    type: 'free_text', responseCount: 177 },

  { id: 'q_014', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_014',
    text: 'If you stopped progressing, what was the main reason?',
    type: 'multiple_choice', responseCount: 160 },

  { id: 'q_015', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_015',
    text: '↳ Please explain why you stopped progressing. (follow-up)',
    type: 'free_text', responseCount: 144 },

  { id: 'q_018', projectId: 'proj_001', categoryId: 'cat_04', sourceColumn: 'q_018',
    text: 'How did the pacing of unlocking technologies/mechanics feel?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.0, responseCount: 177, lowScorePct: 14 },

  // ── Logistics & Resource Transport ──────────────────────────────────────
  { id: 'q_016', projectId: 'proj_001', categoryId: 'cat_05', sourceColumn: 'q_016',
    text: 'How intuitive was the logistics/resource transportation system?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.6, responseCount: 177, lowScorePct: 24 },

  { id: 'q_017', projectId: 'proj_001', categoryId: 'cat_05', sourceColumn: 'q_017',
    text: 'How satisfying was managing and moving resources/items?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.9, responseCount: 177, lowScorePct: 16 },

  { id: 'q_019', projectId: 'proj_001', categoryId: 'cat_05', sourceColumn: 'q_019',
    text: '↳ What could be improved in the logistics/transport system? (follow-up)',
    type: 'free_text', responseCount: 128 },

  // ── User Interface ──────────────────────────────────────────────────────
  { id: 'q_020', projectId: 'proj_001', categoryId: 'cat_06', sourceColumn: 'q_020',
    text: 'How clear and easy to navigate was the User Interface overall?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.4, responseCount: 177, lowScorePct: 30 },

  { id: 'q_021', projectId: 'proj_001', categoryId: 'cat_06', sourceColumn: 'q_021',
    text: 'How easy was it to navigate menus, upgrades, building systems, and interfaces?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.3, responseCount: 177, lowScorePct: 32 },

  { id: 'q_022', projectId: 'proj_001', categoryId: 'cat_06', sourceColumn: 'q_022',
    text: '↳ What parts of the UI felt unclear or frustrating? (follow-up)',
    type: 'free_text', responseCount: 118 },

  { id: 'q_024', projectId: 'proj_001', categoryId: 'cat_06', sourceColumn: 'q_024',
    text: 'What Quality of Life feature would improve your experience the most right now?',
    type: 'free_text', responseCount: 155 },

  // ── Objectives & In-Game Guidance ───────────────────────────────────────
  { id: 'q_027', projectId: 'proj_001', categoryId: 'cat_07', sourceColumn: 'q_027',
    text: 'How clear were the objectives and instructions?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.5, responseCount: 177, lowScorePct: 27 },

  { id: 'q_028', projectId: 'proj_001', categoryId: 'cat_07', sourceColumn: 'q_028',
    text: 'Did you ever need to go to the in-game Instruction Manual or Audio Log?',
    type: 'multiple_choice', responseCount: 177 },

  { id: 'q_029', projectId: 'proj_001', categoryId: 'cat_07', sourceColumn: 'q_029',
    text: '↳ What were you looking for / what was unclear? (follow-up)',
    type: 'free_text', responseCount: 98 },

  // ── Enjoyment & Retention ───────────────────────────────────────────────
  { id: 'q_025', projectId: 'proj_001', categoryId: 'cat_08', sourceColumn: 'q_025',
    text: 'How much did you enjoy the game overall?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.8, responseCount: 177, lowScorePct: 18 },

  { id: 'q_032', projectId: 'proj_001', categoryId: 'cat_08', sourceColumn: 'q_032',
    text: 'How likely are you to continue playing the game after this test? (1–10)',
    type: 'rating_1_10', scaleMin: 1, scaleMax: 10,
    avgScore: 65, responseCount: 177, lowScorePct: 26 },

  { id: 'q_033', projectId: 'proj_001', categoryId: 'cat_08', sourceColumn: 'q_033',
    text: 'How likely are you to recommend this game to your friends? (1–10)',
    type: 'rating_1_10', scaleMin: 1, scaleMax: 10,
    avgScore: 58, responseCount: 177, lowScorePct: 34 },

  { id: 'q_035', projectId: 'proj_001', categoryId: 'cat_08', sourceColumn: 'q_035',
    text: '↳ What makes you want to continue or stop playing? (follow-up)',
    type: 'free_text', responseCount: 160 },

  // ── Zero Gravity Movement ───────────────────────────────────────────────
  { id: 'q_044', projectId: 'proj_001', categoryId: 'cat_09', sourceColumn: 'q_044',
    text: 'How enjoyable was moving and navigating in zero gravity?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.0, responseCount: 177, lowScorePct: 14 },

  { id: 'q_045', projectId: 'proj_001', categoryId: 'cat_09', sourceColumn: 'q_045',
    text: 'Did movement ever feel disorienting or difficult? (1 = very much, 5 = not at all)',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.8, responseCount: 177, lowScorePct: 19 },

  { id: 'q_046', projectId: 'proj_001', categoryId: 'cat_09', sourceColumn: 'q_046',
    text: '↳ What would you change to improve the movement experience? (follow-up)',
    type: 'free_text', responseCount: 88 },

  // ── Mining & Extraction ─────────────────────────────────────────────────
  { id: 'q_047', projectId: 'proj_001', categoryId: 'cat_10', sourceColumn: 'q_047',
    text: 'How satisfying was mining ores with the laser?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.1, responseCount: 177, lowScorePct: 10 },

  { id: 'q_048', projectId: 'proj_001', categoryId: 'cat_10', sourceColumn: 'q_048',
    text: 'Did mining become repetitive too quickly? (1 = yes, very quickly, 5 = not at all)',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.5, responseCount: 177, lowScorePct: 28 },

  { id: 'q_049', projectId: 'proj_001', categoryId: 'cat_10', sourceColumn: 'q_049',
    text: '↳ What would you change to improve the mining experience? (follow-up)',
    type: 'free_text', responseCount: 92 },

  // ── Automation Systems ──────────────────────────────────────────────────
  { id: 'q_050', projectId: 'proj_001', categoryId: 'cat_11', sourceColumn: 'q_050',
    text: 'How satisfying was it to watch your automated systems work together?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.3, responseCount: 177, lowScorePct: 8 },

  { id: 'q_051', projectId: 'proj_001', categoryId: 'cat_11', sourceColumn: 'q_051',
    text: 'Was the automation of production or floater management intuitive to set up? (1–5)',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.4, responseCount: 177, lowScorePct: 29 },

  { id: 'q_052', projectId: 'proj_001', categoryId: 'cat_11', sourceColumn: 'q_052',
    text: 'How satisfying was transporting resources through space using accelerators and logistics systems?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.0, responseCount: 177, lowScorePct: 12 },

  { id: 'q_053', projectId: 'proj_001', categoryId: 'cat_11', sourceColumn: 'q_053',
    text: 'Did watching resources flow through your systems feel visually rewarding?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 4.2, responseCount: 177, lowScorePct: 9 },

  { id: 'q_054', projectId: 'proj_001', categoryId: 'cat_11', sourceColumn: 'q_054',
    text: 'Did you feel like your operation/factory automation meaningfully evolved over time?',
    type: 'rating_1_5', scaleMin: 1, scaleMax: 5,
    avgScore: 3.9, responseCount: 177, lowScorePct: 16 },

  // ── Open Highlights & Feedback ──────────────────────────────────────────
  { id: 'q_026', projectId: 'proj_001', categoryId: 'cat_12', sourceColumn: 'q_026',
    text: 'What was your favorite part of the game?',
    type: 'free_text', responseCount: 170 },

  { id: 'q_055', projectId: 'proj_001', categoryId: 'cat_12', sourceColumn: 'q_055',
    text: 'At what point did the game become the most exciting for you?',
    type: 'free_text', responseCount: 155 },

  { id: 'q_056', projectId: 'proj_001', categoryId: 'cat_12', sourceColumn: 'q_056',
    text: 'What makes this game stand out compared to other automation/base-building games you played?',
    type: 'free_text', responseCount: 148 },

  // ── Performance & Bugs ──────────────────────────────────────────────────
  { id: 'q_037', projectId: 'proj_001', categoryId: 'cat_13', sourceColumn: 'q_037',
    text: 'Did you encounter any performance issues? (e.g. FPS drops with many floaters, stuttering during explosions)',
    type: 'free_text', responseCount: 177 },

  // ── Evidence & Recordings ───────────────────────────────────────────────
  { id: 'q_038', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_038',
    text: 'Did you record your gameplay or have images you would like to share?',
    type: 'yes_no', responseCount: 177 },

  { id: 'q_039', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_039',
    text: 'Describe what happened during the playtest (for those not uploading files)',
    type: 'free_text', responseCount: 88 },

  { id: 'q_040', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_040',
    text: 'Upload: Gameplay recordings or images (Google Drive)',
    type: 'file_upload', responseCount: 62 },

  { id: 'q_041', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_041',
    text: 'Upload: External link if not using Google Drive',
    type: 'free_text', responseCount: 18 },

  { id: 'q_042', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_042',
    text: 'Footage timestamps: where you felt confused, frustrated, stuck, or excited',
    type: 'free_text', responseCount: 41 },

  { id: 'q_043', projectId: 'proj_001', categoryId: 'cat_14', sourceColumn: 'q_043',
    text: 'Notes for the uploaded files',
    type: 'free_text', responseCount: 35 },

  // ── Admin / Internal ────────────────────────────────────────────────────
  { id: 'q_057', projectId: 'proj_001', categoryId: 'cat_15', sourceColumn: 'q_057',
    text: 'Evaluation Score (1 WORST – 5 BEST) — internal',
    type: 'internal_admin', responseCount: 177 },

  { id: 'q_058', projectId: 'proj_001', categoryId: 'cat_15', sourceColumn: 'q_058',
    text: 'Admin Notes — internal',
    type: 'internal_admin', responseCount: 0 },

  { id: 'q_059', projectId: 'proj_001', categoryId: 'cat_15', sourceColumn: 'q_059',
    text: '__EMPTY — internal tracking ID',
    type: 'internal_admin', responseCount: 177 },

  { id: 'q_060', projectId: 'proj_001', categoryId: 'cat_15', sourceColumn: 'q_060',
    text: 'Amount — payment tracking',
    type: 'internal_admin', responseCount: 177 },
];

// ---------------------------------------------------------------------------
// Testers — sample set for demo mode
// ---------------------------------------------------------------------------
export const mockTesters: Tester[] = [
  {
    id: 'tstr_01', testerId: 'T-001', email: 'alex.m@example.com', discord: 'AlexM#4421',
    segments: {
      age_group: '25 - 34', gender: 'Male', country: 'United States',
      employment: 'Employed full-time', gamer_type: 'Hardcore, Competitive',
      gaming_hours: '21 - 30', platform: 'PC / Mac', gaming_pref: 'Single Player, Co-op',
      hardware_tier: 'High', has_controller: 'No', has_mic: 'Yes',
    },
    ageGroup: '25 - 34', country: 'United States', gamingProfile: 'Hardcore, Competitive',
    hardware: 'High-end', similarGamesPlayed: ['Factorio', 'Satisfactory', 'Dyson Sphere Program'],
    rawProfileJson: {}, avgRating: 4.1, isOutlier: false,
  },
  {
    id: 'tstr_02', testerId: 'T-002', email: 'marie.d@example.com', discord: 'MarieD#7812',
    segments: {
      age_group: '18 - 24', gender: 'Female', country: 'France',
      employment: 'Student', gamer_type: 'Casual, Social',
      gaming_hours: '10 - 20', platform: 'PC / Mac, Mobile (Android / iOS)', gaming_pref: 'Single Player, Multiplayer',
      hardware_tier: 'Mid', has_controller: 'Yes', has_mic: 'Yes',
    },
    ageGroup: '18 - 24', country: 'France', gamingProfile: 'Casual, Social',
    hardware: 'Mid-end', similarGamesPlayed: ['Stardew Valley'],
    rawProfileJson: {}, avgRating: 2.8, isOutlier: true,
  },
  {
    id: 'tstr_03', testerId: 'T-003', email: 'chen.w@example.com', discord: 'ChenW#0033',
    segments: {
      age_group: '35 - 44', gender: 'Male', country: 'Canada',
      employment: 'Employed full-time', gamer_type: 'Hardcore',
      gaming_hours: '31 - 40', platform: 'PC / Mac', gaming_pref: 'Single Player',
      hardware_tier: 'High', has_controller: 'No', has_mic: 'Yes',
    },
    ageGroup: '35 - 44', country: 'Canada', gamingProfile: 'Hardcore',
    hardware: 'High-end', similarGamesPlayed: ['Factorio', 'Rimworld', 'Satisfactory'],
    rawProfileJson: {}, avgRating: 4.6, isOutlier: false,
  },
  {
    id: 'tstr_04', testerId: 'T-004', email: 'priya.s@example.com', discord: 'PriyaS#2209',
    segments: {
      age_group: '25 - 34', gender: 'Female', country: 'India',
      employment: 'Employed part-time', gamer_type: 'Casual',
      gaming_hours: '10 - 20', platform: 'PC / Mac', gaming_pref: 'Single Player, Multiplayer',
      hardware_tier: 'Low', has_controller: 'No', has_mic: 'No',
    },
    ageGroup: '25 - 34', country: 'India', gamingProfile: 'Casual',
    hardware: 'Low-end', similarGamesPlayed: ['Minecraft'],
    rawProfileJson: {}, avgRating: 3.2, isOutlier: false,
  },
  {
    id: 'tstr_05', testerId: 'T-005', email: 'jakob.n@example.com', discord: 'JakobN#5500',
    segments: {
      age_group: '45 - 54', gender: 'Male', country: 'Germany',
      employment: 'Employed full-time', gamer_type: 'Competitive, Hardcore',
      gaming_hours: '21 - 30', platform: 'PC / Mac', gaming_pref: 'Single Player',
      hardware_tier: 'Mid', has_controller: 'Yes', has_mic: 'Yes',
    },
    ageGroup: '45 - 54', country: 'Germany', gamingProfile: 'Competitive, Hardcore',
    hardware: 'Mid-end', similarGamesPlayed: ['Anno 1800', 'Factorio'],
    rawProfileJson: {}, avgRating: 3.9, isOutlier: false,
  },
  {
    id: 'tstr_06', testerId: 'T-006', email: 'sofia.l@example.com', discord: 'SofiaL#9910',
    segments: {
      age_group: '18 - 24', gender: 'Female', country: 'Brazil',
      employment: 'Student', gamer_type: 'Casual, Social',
      gaming_hours: '< 10', platform: 'PC / Mac, Mobile (Android / iOS)', gaming_pref: 'Multiplayer, Co-op',
      hardware_tier: 'Low', has_controller: 'No', has_mic: 'No',
    },
    ageGroup: '18 - 24', country: 'Brazil', gamingProfile: 'Casual, Social',
    hardware: 'Low-end', similarGamesPlayed: [],
    rawProfileJson: {}, avgRating: 2.1, isOutlier: true,
  },
  {
    id: 'tstr_07', testerId: 'T-007', email: 'ryo.t@example.com', discord: 'RyoT#3344',
    segments: {
      age_group: '25 - 34', gender: 'Male', country: 'Japan',
      employment: 'Employed full-time', gamer_type: 'Hardcore, Competitive',
      gaming_hours: '31 - 40', platform: 'PC / Mac', gaming_pref: 'Single Player, Co-op',
      hardware_tier: 'High', has_controller: 'No', has_mic: 'Yes',
    },
    ageGroup: '25 - 34', country: 'Japan', gamingProfile: 'Hardcore, Competitive',
    hardware: 'High-end', similarGamesPlayed: ['Satisfactory', 'Dyson Sphere Program', 'Mindustry'],
    rawProfileJson: {}, avgRating: 4.8, isOutlier: false,
  },
];

// ---------------------------------------------------------------------------
// Sample responses for demo mode — referencing real question IDs
// ---------------------------------------------------------------------------
export const mockResponses: Response[] = [
  // q_005 — frustration frequency (rating)
  { id: 'r_001', projectId: 'proj_001', testerId: 'tstr_01', questionId: 'q_005', rawAnswer: '2', numericValue: 2, normalizedScore: 25,  submittedAt: '2026-05-01T14:22:00Z', matchStatus: 'matched' },
  { id: 'r_002', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_005', rawAnswer: '4', numericValue: 4, normalizedScore: 75,  submittedAt: '2026-05-01T15:10:00Z', matchStatus: 'matched' },
  { id: 'r_003', projectId: 'proj_001', testerId: 'tstr_03', questionId: 'q_005', rawAnswer: '1', numericValue: 1, normalizedScore: 0,   submittedAt: '2026-05-01T16:00:00Z', matchStatus: 'matched' },
  { id: 'r_004', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_005', rawAnswer: '3', numericValue: 3, normalizedScore: 50,  submittedAt: '2026-05-01T16:30:00Z', matchStatus: 'matched' },
  { id: 'r_005', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_005', rawAnswer: '5', numericValue: 5, normalizedScore: 100, submittedAt: '2026-05-01T17:30:00Z', matchStatus: 'matched' },
  { id: 'r_006', projectId: 'proj_001', testerId: 'tstr_07', questionId: 'q_005', rawAnswer: '2', numericValue: 2, normalizedScore: 25,  submittedAt: '2026-05-01T18:00:00Z', matchStatus: 'matched' },

  // q_006 — what caused frustration (free text follow-up)
  { id: 'r_010', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_006', rawAnswer: "The tutorial didn't explain how to start the conveyor chain. I spent 10 minutes clicking things randomly.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T15:11:00Z', matchStatus: 'matched' },
  { id: 'r_011', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_006', rawAnswer: "I had no idea what the blinking icon in the top right meant. No tooltip or explanation.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:31:00Z', matchStatus: 'matched' },
  { id: 'r_012', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_006', rawAnswer: "Everything. Nothing was explained. The HUD is full of symbols I've never seen before.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:31:00Z', matchStatus: 'matched' },

  // q_034 — session playtime
  { id: 'r_013', projectId: 'proj_001', testerId: 'tstr_01', questionId: 'q_034', rawAnswer: '2.5', numericValue: 2.5, normalizedScore: null, submittedAt: '2026-05-01T14:52:00Z', matchStatus: 'matched' },
  { id: 'r_014', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_034', rawAnswer: '1.5', numericValue: 1.5, normalizedScore: null, submittedAt: '2026-05-01T15:22:00Z', matchStatus: 'matched' },
  { id: 'r_015', projectId: 'proj_001', testerId: 'tstr_03', questionId: 'q_034', rawAnswer: '3h 10m', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:25:00Z', matchStatus: 'matched' },
  { id: 'r_016', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_034', rawAnswer: '2', numericValue: 2, normalizedScore: null, submittedAt: '2026-05-01T16:51:00Z', matchStatus: 'matched' },
  { id: 'r_017', projectId: 'proj_001', testerId: 'tstr_05', questionId: 'q_034', rawAnswer: '2.75', numericValue: 2.75, normalizedScore: null, submittedAt: '2026-05-01T17:16:00Z', matchStatus: 'matched' },
  { id: 'r_018', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_034', rawAnswer: '1h 20m', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:49:00Z', matchStatus: 'matched' },
  { id: 'r_019', projectId: 'proj_001', testerId: 'tstr_07', questionId: 'q_034', rawAnswer: '4', numericValue: 4, normalizedScore: null, submittedAt: '2026-05-01T18:25:00Z', matchStatus: 'matched' },

  // q_013 — progression reached
  { id: 'r_060', projectId: 'proj_001', testerId: 'tstr_01', questionId: 'q_013', rawAnswer: 'Tier 3', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T14:53:00Z', matchStatus: 'matched' },
  { id: 'r_061', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_013', rawAnswer: 'Tier 2', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T15:23:00Z', matchStatus: 'matched' },
  { id: 'r_062', projectId: 'proj_001', testerId: 'tstr_03', questionId: 'q_013', rawAnswer: 'Automation stage 4', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:26:00Z', matchStatus: 'matched' },
  { id: 'r_063', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_013', rawAnswer: 'Tier 2', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:52:00Z', matchStatus: 'matched' },
  { id: 'r_064', projectId: 'proj_001', testerId: 'tstr_05', questionId: 'q_013', rawAnswer: 'Tier 3', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:17:00Z', matchStatus: 'matched' },
  { id: 'r_065', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_013', rawAnswer: 'Level 1', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:50:00Z', matchStatus: 'matched' },
  { id: 'r_066', projectId: 'proj_001', testerId: 'tstr_07', questionId: 'q_013', rawAnswer: 'Tier 4', numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T18:26:00Z', matchStatus: 'matched' },

  // q_025 — overall enjoyment (rating)
  { id: 'r_020', projectId: 'proj_001', testerId: 'tstr_01', questionId: 'q_025', rawAnswer: '4', numericValue: 4, normalizedScore: 75,  submittedAt: '2026-05-01T14:40:00Z', matchStatus: 'matched' },
  { id: 'r_021', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_025', rawAnswer: '2', numericValue: 2, normalizedScore: 25,  submittedAt: '2026-05-01T15:20:00Z', matchStatus: 'matched' },
  { id: 'r_022', projectId: 'proj_001', testerId: 'tstr_03', questionId: 'q_025', rawAnswer: '5', numericValue: 5, normalizedScore: 100, submittedAt: '2026-05-01T16:10:00Z', matchStatus: 'matched' },
  { id: 'r_023', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_025', rawAnswer: '3', numericValue: 3, normalizedScore: 50,  submittedAt: '2026-05-01T16:40:00Z', matchStatus: 'matched' },
  { id: 'r_024', projectId: 'proj_001', testerId: 'tstr_05', questionId: 'q_025', rawAnswer: '4', numericValue: 4, normalizedScore: 75,  submittedAt: '2026-05-01T17:10:00Z', matchStatus: 'matched' },
  { id: 'r_025', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_025', rawAnswer: '2', numericValue: 2, normalizedScore: 25,  submittedAt: '2026-05-01T17:40:00Z', matchStatus: 'matched' },
  { id: 'r_026', projectId: 'proj_001', testerId: 'tstr_07', questionId: 'q_025', rawAnswer: '5', numericValue: 5, normalizedScore: 100, submittedAt: '2026-05-01T18:10:00Z', matchStatus: 'matched' },

  // q_026 — favourite part (free text)
  { id: 'r_030', projectId: 'proj_001', testerId: 'tstr_01', questionId: 'q_026', rawAnswer: "The physics side of the game is a very clever twist on this sort of factory game. Setting up corner pieces and shooting resources through space.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T14:50:00Z', matchStatus: 'matched' },
  { id: 'r_031', projectId: 'proj_001', testerId: 'tstr_03', questionId: 'q_026', rawAnswer: "Automation potential is huge. I can see this game being extremely deep. The factory chains are already fun at this stage.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:20:00Z', matchStatus: 'matched' },
  { id: 'r_032', projectId: 'proj_001', testerId: 'tstr_07', questionId: 'q_026', rawAnswer: "The art style is gorgeous and the movement feels crisp. Also love the ambient sound design.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T18:20:00Z', matchStatus: 'matched' },

  // q_022 — UI pain points (free text)
  { id: 'r_040', projectId: 'proj_001', testerId: 'tstr_02', questionId: 'q_022', rawAnswer: "The UI is overwhelming. Too many icons, no clear labels. I felt lost the entire time.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T15:25:00Z', matchStatus: 'matched' },
  { id: 'r_041', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_022', rawAnswer: "It wasn't clear that you need to hold to build. I kept single-clicking wondering why nothing happened.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:45:00Z', matchStatus: 'matched' },
  { id: 'r_042', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_022', rawAnswer: "Too confusing for someone not familiar with automation games. Needs tooltips everywhere.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:45:00Z', matchStatus: 'matched' },

  // q_037 — performance issues (free text)
  { id: 'r_050', projectId: 'proj_001', testerId: 'tstr_04', questionId: 'q_037', rawAnswer: "FPS dropped noticeably when there were many floaters in the same area. Got to around 20fps at one point.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T16:45:00Z', matchStatus: 'matched' },
  { id: 'r_051', projectId: 'proj_001', testerId: 'tstr_06', questionId: 'q_037', rawAnswer: "Performance was really bad on my machine. Unplayable at times near ore deposits.", numericValue: null, normalizedScore: null, submittedAt: '2026-05-01T17:45:00Z', matchStatus: 'matched' },
];

// ---------------------------------------------------------------------------
// Themes — derived from open-text analysis of the real question content
// ---------------------------------------------------------------------------
export const mockThemes: Theme[] = [
  {
    id: 'th_01', projectId: 'proj_001', categoryId: 'cat_06', questionId: 'q_022',
    label: 'UI icons and labels are unclear',
    summary: 'Multiple testers found the HUD and menus difficult to read, with unlabelled icons, no tooltips, and a generally overwhelming first impression. Predominantly reported by casual players and those without automation-game experience.',
    frequency: 47, severity: 'High', confidence: 0.87, priority: 'Critical',
    affectedCategory: 'User Interface', affectedQuestions: ['q_020', 'q_021', 'q_022'],
    representativeQuotes: [
      "The UI is overwhelming. Too many icons, no clear labels. I felt lost the entire time.",
      "I had no idea what the blinking icon in the top right meant. No tooltip or explanation.",
      "The HUD is full of symbols I've never seen before.",
    ],
    linkedResponseIds: ['r_040', 'r_041', 'r_042'],
  },
  {
    id: 'th_02', projectId: 'proj_001', categoryId: 'cat_03', questionId: 'q_008',
    label: 'Conveyor/belt setup not explained',
    summary: 'Players unfamiliar with the automation genre had no mental model for how to start a logistics chain. The tutorial covers movement but not the core build-and-connect loop.',
    frequency: 39, severity: 'High', confidence: 0.91, priority: 'Critical',
    affectedCategory: 'Mechanics & Clarity', affectedQuestions: ['q_007', 'q_008', 'q_030'],
    representativeQuotes: [
      "The tutorial didn't explain how to start the conveyor chain. I spent 10 minutes clicking things randomly.",
      "I could not figure out how to connect the belt to the extractor.",
    ],
    linkedResponseIds: ['r_010'],
  },
  {
    id: 'th_03', projectId: 'proj_001', categoryId: 'cat_13', questionId: 'q_037',
    label: 'FPS drops with many floaters',
    summary: 'Low-end and mid-range PC testers reported significant FPS drops when floater density was high. Correlates strongly with lower enjoyment scores in this segment.',
    frequency: 28, severity: 'High', confidence: 0.83, priority: 'High',
    affectedCategory: 'Performance & Bugs', affectedQuestions: ['q_037'],
    representativeQuotes: [
      "FPS dropped noticeably when there were many floaters in the same area. Got to around 20fps at one point.",
      "Performance was really bad on my machine. Unplayable at times near ore deposits.",
    ],
    linkedResponseIds: ['r_050', 'r_051'],
  },
  {
    id: 'th_04', projectId: 'proj_001', categoryId: 'cat_11', questionId: 'q_051',
    label: 'Automation setup intuition gap for genre newcomers',
    summary: 'Testers without Factorio/Satisfactory background found the automation chain setup unintuitive. Experienced players rated this highly; newcomers rated it significantly lower.',
    frequency: 33, severity: 'Medium', confidence: 0.85, priority: 'High',
    affectedCategory: 'Automation Systems', affectedQuestions: ['q_051', 'q_054'],
    representativeQuotes: [
      "Spent 20 minutes trying to figure out the belt direction.",
      "I had no idea how to connect the conveyors to the extractor.",
    ],
    linkedResponseIds: [],
  },
  {
    id: 'th_05', projectId: 'proj_001', categoryId: 'cat_12', questionId: 'q_056',
    label: 'Physics-based factory is the core differentiator',
    summary: 'The zero-gravity physics mechanic is consistently called out as the standout feature that sets Exovia apart from Factorio and Satisfactory. Players find the resource-shooting accelerator loop uniquely satisfying.',
    frequency: 61, severity: 'Low', confidence: 0.93, priority: 'Low',
    affectedCategory: 'Open Highlights & Feedback', affectedQuestions: ['q_056', 'q_055'],
    representativeQuotes: [
      "The physics side of the game is a very clever twist on this sort of factory game.",
      "Setting up corner pieces and shooting resources through space feels genuinely unique.",
      "By far the stand out element. Nothing else does this.",
    ],
    linkedResponseIds: ['r_030', 'r_031', 'r_032'],
  },
  {
    id: 'th_06', projectId: 'proj_001', categoryId: 'cat_02', questionId: 'q_006',
    label: 'Hold-to-build mechanic not communicated',
    summary: 'A recurring specific confusion: players repeatedly single-clicked expecting to place buildings, not realising they needed to hold. No in-game prompt or tutorial step covers this.',
    frequency: 22, severity: 'Medium', confidence: 0.88, priority: 'High',
    affectedCategory: 'Overall Friction & Session', affectedQuestions: ['q_006', 'q_008'],
    representativeQuotes: [
      "It wasn't clear that you need to hold to build. I kept single-clicking wondering why nothing happened.",
      "Couldn't figure out how to place anything for the first few minutes.",
    ],
    linkedResponseIds: ['r_041'],
  },
];

// ---------------------------------------------------------------------------
// Rating distributions — for the most-analysed rating questions in the demo
// ---------------------------------------------------------------------------
export const mockRatingDistributions: Record<string, { value: number; count: number; pct: number }[]> = {
  q_005: [ // Frustration frequency (low = bad, high = good)
    { value: 1, count: 18, pct: 10 },
    { value: 2, count: 74, pct: 42 },
    { value: 3, count: 44, pct: 25 },
    { value: 4, count: 28, pct: 16 },
    { value: 5, count: 13, pct: 7  },
  ],
  q_007: [ // Mechanics clarity
    { value: 1, count: 8,  pct: 5  },
    { value: 2, count: 31, pct: 17 },
    { value: 3, count: 50, pct: 28 },
    { value: 4, count: 61, pct: 35 },
    { value: 5, count: 27, pct: 15 },
  ],
  q_020: [ // UI overall clarity
    { value: 1, count: 14, pct: 8  },
    { value: 2, count: 39, pct: 22 },
    { value: 3, count: 55, pct: 31 },
    { value: 4, count: 48, pct: 27 },
    { value: 5, count: 21, pct: 12 },
  ],
  q_025: [ // Overall enjoyment
    { value: 1, count: 6,  pct: 3  },
    { value: 2, count: 26, pct: 15 },
    { value: 3, count: 41, pct: 23 },
    { value: 4, count: 67, pct: 38 },
    { value: 5, count: 37, pct: 21 },
  ],
  q_047: [ // Mining satisfaction
    { value: 1, count: 4,  pct: 2  },
    { value: 2, count: 14, pct: 8  },
    { value: 3, count: 28, pct: 16 },
    { value: 4, count: 71, pct: 40 },
    { value: 5, count: 60, pct: 34 },
  ],
  q_050: [ // Automation satisfaction
    { value: 1, count: 3,  pct: 2  },
    { value: 2, count: 11, pct: 6  },
    { value: 3, count: 24, pct: 14 },
    { value: 4, count: 62, pct: 35 },
    { value: 5, count: 77, pct: 43 },
  ],
  q_051: [ // Automation intuitiveness
    { value: 1, count: 19, pct: 11 },
    { value: 2, count: 32, pct: 18 },
    { value: 3, count: 44, pct: 25 },
    { value: 4, count: 52, pct: 29 },
    { value: 5, count: 30, pct: 17 },
  ],
};
