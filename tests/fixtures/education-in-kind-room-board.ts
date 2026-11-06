import { educatorInKindFixture } from './educator-in-kind.js';

/** Derived actual source records; expected amounts are independently specified. */
export function inKindRoomBoardFixture(year = 2026) {
  const input = educatorInKindFixture(year);
  input.adjustments = undefined;
  input.educationExpenses = undefined;
  const expense = input.qualifiedEducationExpenses?.sourceFacts?.expenses?.[0];
  if (!expense) throw new Error('Missing synthetic expense source');
  expense.category = 'postsecondary_room_board';
  expense.halfTimeStudent = true;
  expense.roomBoardAllowance = '3000';
  expense.schoolOwnedHousingCharge = '0';
  return input;
}
