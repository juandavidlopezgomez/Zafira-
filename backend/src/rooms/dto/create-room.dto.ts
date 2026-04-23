import { IsIn } from 'class-validator';

const VALID_MODES = [
  'bottle',
  'truth-dare',
  'battle-1v1',
  'liga',
  'juicio',
  'oscuro',
  'cartas',
  'termometro',
  'actores',
  'ultimo-pie',
  'todo-nada',
] as const;

export type GameMode = (typeof VALID_MODES)[number];

export class CreateRoomDto {
  @IsIn(VALID_MODES)
  mode: GameMode;
}
