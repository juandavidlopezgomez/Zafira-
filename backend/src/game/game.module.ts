import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway.js';
import { GameService } from './game.service.js';
import { BottleService } from './modes/bottle.service.js';
import { TruthDareService } from './modes/truth-dare.service.js';
import { Battle1v1Service } from './modes/battle-1v1.service.js';
import { LigaService } from './modes/liga.service.js';
import { JuicioService } from './modes/juicio.service.js';
import { OscuroService } from './modes/oscuro.service.js';
import { CartasService } from './modes/cartas.service.js';
import { TermometroService } from './modes/termometro.service.js';
import { ActoresService } from './modes/actores.service.js';
import { UltimoPieService } from './modes/ultimo-pie.service.js';
import { TodoNadaService } from './modes/todo-nada.service.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [RoomsModule, AuthModule],
  providers: [
    GameGateway,
    GameService,
    BottleService,
    TruthDareService,
    Battle1v1Service,
    LigaService,
    JuicioService,
    OscuroService,
    CartasService,
    TermometroService,
    ActoresService,
    UltimoPieService,
    TodoNadaService,
  ],
  exports: [GameService],
})
export class GameModule {}
