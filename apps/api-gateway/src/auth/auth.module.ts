import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { JwtService } from './jwt.service.js'
import { PrismaService } from './prisma.service.js'

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtService, PrismaService],
  exports: [JwtService, PrismaService],
})
export class AuthModule {}
