import type { LevelSpec } from '../types';
import { L01 } from './L01';
import { L02 } from './L02';
import { L03 } from './L03';
import { L04 } from './L04';
import { L05 } from './L05';


// The level register, played in order. Future scenarios (L03 flapping cart,
// L04 error budget, L05 chaos friday) append here as they come online.
export const LEVELS: LevelSpec[] = [L01, L02, L03, L04, L05];

export { L01, L02, L03, L04, L05 };
