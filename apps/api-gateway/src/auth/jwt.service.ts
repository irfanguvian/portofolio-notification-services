import { Inject, Injectable } from '@nestjs/common'
import jwt from 'jsonwebtoken'
import { type AppEnv, ENV_TOKEN } from '../config/env.js'

export interface JwtPayload {
  sub: string
  email: string
}

@Injectable()
export class JwtService {
  constructor(@Inject(ENV_TOKEN) private readonly env: AppEnv) {}

  sign(payload: JwtPayload): string {
    return jwt.sign(payload, this.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: this.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })
  }

  verify(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof decoded === 'string' || !decoded || typeof decoded !== 'object') {
      throw new Error('Invalid JWT payload')
    }
    const obj = decoded as jwt.JwtPayload
    if (typeof obj.sub !== 'string' || typeof obj.email !== 'string') {
      throw new Error('JWT missing required claims')
    }
    return { sub: obj.sub, email: obj.email }
  }
}
