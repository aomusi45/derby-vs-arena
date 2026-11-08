import {buildWeeklyRaces} from './weekly-race-schedule.mjs';

export function buildSingleTestRace(now = new Date()) {
  const race = buildWeeklyRaces(now)[0];

  return {
    ...race,
    id: 'test_single_osaka_001',
    raceName: '大阪杯',
    distance: 2000,
    going: '良',
    category: '古馬',
    status: 'open',
    registeredCount: 0,
    official: false,
    test: true
  };
}
