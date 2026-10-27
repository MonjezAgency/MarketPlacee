import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data) => {
                // File downloads (StreamableFile / Buffer) go out untouched: turning them
                // into plain objects broke every download (500 or a JSON dump of the stream).
                if (data instanceof StreamableFile || Buffer.isBuffer(data)) return data;
                // This ensures that class-transformer decorators (like @Exclude) are respected
                return instanceToPlain(data);
            }),
        );
    }
}
