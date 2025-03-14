import { z } from 'zod';
import { extendZod } from '@zodyac/zod-mongoose';

// Call extendZod once for your application
extendZod(z);

export { z };