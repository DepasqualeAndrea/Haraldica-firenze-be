import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (user?.user && typeof user.user === 'object') {
      console.log('⚠️ User object nested, estraggo user.user');
      return user.user;
    }

    return user;
  },
);