import toursData from "./gotrail-tours.json";

export interface GoTrailTour {
  slug: string;
  title: string;
  link: string;
  img: string;
  tags: string[];
  time: string;
  length: string;
  difficultyLevel: number;
  difficultyIcon: string;
  height: string;
  oldPrice: string;
  newPrice: string;
}

// TODO: Replace with live TRIPS query service once Public Catalog API (PRD section 14 step 3) is implemented by GPT/Codex.
export const GOTRAIL_TOURS: GoTrailTour[] = toursData as GoTrailTour[];
