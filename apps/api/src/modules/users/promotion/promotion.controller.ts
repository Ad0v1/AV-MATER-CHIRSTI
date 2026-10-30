import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../../common/auth/roles.decorator.js';
import { actorOf, type RequestWithUser } from '../../academic/request-user.js';
import { ZodValidationPipe } from '../../academic/zod-validation.pipe.js';
import { ActiveActorGuard } from '../active-actor.guard.js';
import { idSchema } from '../users.dto.js';
import {
  promotionCommitSchema,
  promotionProposalQuerySchema,
  type PromotionCommitDto,
  type PromotionProposalQuery,
} from './promotion.dto.js';
import {
  PromotionService,
  type PromotionProposal,
  type PromotionResult,
} from './promotion.service.js';

// RF-16 / RN-15: promoción en bloque. :id es el año destino. Solo ADMIN activo.
@Roles('ADMIN')
@UseGuards(ActiveActorGuard)
@Controller('academic-years')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  // Lectura sin estado y sin bitácora.
  @Get(':id/promotion-proposal')
  proposal(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Query(new ZodValidationPipe(promotionProposalQuerySchema)) query: PromotionProposalQuery,
  ): Promise<PromotionProposal> {
    return this.promotion.proposal(id, query.sourceYearId);
  }

  // Confirmación todo o nada (201).
  @Post(':id/promotion')
  commit(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(promotionCommitSchema)) dto: PromotionCommitDto,
    @Req() req: RequestWithUser,
  ): Promise<PromotionResult> {
    return this.promotion.commit(id, dto, actorOf(req));
  }
}
