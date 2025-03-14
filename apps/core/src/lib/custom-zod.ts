import { z } from 'zod';
import { extendZod } from '@zodyac/zod-mongoose';
import { extendZodWithOpenApi } from 'zod-openapi';

extendZod(z);
extendZodWithOpenApi(z);

export { z };