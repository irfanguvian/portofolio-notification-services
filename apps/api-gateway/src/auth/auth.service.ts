import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { JwtService } from './jwt.service.js'
import { PrismaService } from './prisma.service.js'

const BCRYPT_ROUNDS = 10

export interface AuthResult {
  token: string
  userId: string
  email: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const normalized = email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } })
    if (existing) {
      throw new ConflictException('Email already registered')
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const id = uuidv4()
    const user = await this.prisma.user.create({
      data: { id, email: normalized, passwordHash },
    })
    this.logger.log({ event: 'FEATURE_USER_REGISTERED', userId: user.id })
    const token = this.jwt.sign({ sub: user.id, email: user.email })
    return { token, userId: user.id, email: user.email }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalized = email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email: normalized } })
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials')
    }
    this.logger.log({ event: 'FEATURE_USER_LOGIN', userId: user.id })
    const token = this.jwt.sign({ sub: user.id, email: user.email })
    return { token, userId: user.id, email: user.email }
  }
}
