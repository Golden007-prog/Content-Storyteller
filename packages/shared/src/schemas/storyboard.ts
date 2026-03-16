export interface StoryboardScene {
  sceneNumber: number;
  description: string;
  duration: string;
  motionStyle: string;
  textOverlay: string;
  cameraDirection: string;
}

export interface Storyboard {
  scenes: StoryboardScene[];
  totalDuration: string;
  pacing: string;
}
