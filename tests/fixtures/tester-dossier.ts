import production from './portal-production-response.json';

/** Contract from We Need More Nails; media URLs are synthetic, never live signatures. */
export function dossierFixture() {
  const kinds = ['ScaleAgree', 'ScaleQuality', 'ScaleIntent', 'Rating1_10', 'SingleChoice', 'LongText'];
  const questions = Array.from({ length: 26 }, (_, i) => ({
    QuestionID: 950 + i, QuestionText: `Question ${i + 1}`, QuestionDescription: null,
    DisplayOrder: i + 4, TypeName: kinds[i % kinds.length],
    Category: { key: 'controls', code: 'E', label: 'Controls and interface' },
    Scale: i % 6 < 4 ? { min: 1, max: i % 6 === 3 ? 10 : 5, labels: null } : null,
  }));
  return {
    test: { TestID: 18, TestName: 'We Need More Nails', steamMatchGenres: ['Puzzle'] },
    questions,
    responses: [28, 29].map((responseId, i) => ({
      ...structuredClone(production.responses[0]), responseId,
      tester: { ...structuredClone(production.responses[0].tester), anonymous: true, username: 'hidden-user', gamingPreferences: i ? ['Puzzle'] : ['Action'] },
      answers: questions.map((q, j) => ({ questionId: q.QuestionID, value: j % 6 < 4 ? String(i ? 5 : 1) : j % 6 === 4 ? 'About right' : `Written response ${j + 1}\nSecond line of feedback.` })),
      files: [{ questionId: 955, fileName: 'attachment-1.mp4', contentType: 'video/mp4', url: 'https://media.example.test/recording.mp4', uploadedAt: '2026-09-26T20:00:00Z' }, { questionId: 955, fileName: 'screenshot.jpg', contentType: 'image/jpeg', url: 'https://media.example.test/screenshot.jpg' }],
    })),
    stats: { totalResponses: 2 },
  };
}
