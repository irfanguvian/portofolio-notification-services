import { type ExecutionContext, createParamDecorator } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

export interface AuthUser {
  id: string
  email: string
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>()
    if (!req.user) {
      throw new Error('CurrentUser used without JwtAuthGuard')
    }
    return req.user
  },
)
