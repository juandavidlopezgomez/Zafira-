import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AgeVerificationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: { age: number } }>();
    if (!request.user?.age || request.user.age < 18) {
      throw new ForbiddenException('Debes ser mayor de 18 años para acceder a Modo Oscuro');
    }
    return true;
  }
}
