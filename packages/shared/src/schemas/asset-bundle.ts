import { AssetReference, FallbackNotice } from '../types/job';
import { CreativeBrief } from './creative-brief';

export interface AssetBundle {
  jobId: string;
  completedAt: Date;
  assets: AssetReference[];
  creativeBrief: CreativeBrief;
  fallbackNotices: FallbackNotice[];
}
