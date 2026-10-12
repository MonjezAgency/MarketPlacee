import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Attaches req.user when a valid token is present; anonymous requests pass with req.user = null. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    handleRequest(_err: unknown, user: any) {
        return user || null;
    }
}
