import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { JwtService } from '../../auth/jwt.service.js'
import type { AuthUser } from '../decorators/current-user.decorator.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>()
    const header = req.headers.authorization
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header')
    }
    const token = header.slice('Bearer '.length).trim()
    if (!token) {
      throw new UnauthorizedException('Empty bearer token')
    }
    try {
      const payload = this.jwt.verify(token)
      req.user = { id: payload.sub, email: payload.email }
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
