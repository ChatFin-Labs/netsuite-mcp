// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
const Fuse = require('fuse.js');
import lodash from 'lodash';
import { GenDictionary } from '../Models/General';

export function fuzzySearch(
  arrData: GenDictionary[],
  searchString: string,
  property?: string,
  getOnlyExactMatchIfExists?: boolean,
  threshold?: number
): GenDictionary[] {
  const options: GenDictionary = {
    includeScore: true,
    threshold: threshold ?? 0.2,
    location: 0,
    distance: 10, // will ignore the distance of (threshold percentage of distance characters, eg: threshold = 0.2, distance = 5, will ignore the one character distance)
  };
  if (property) options.keys = [property];

  const data = lodash.cloneDeep(arrData);
  for (const obj of data) {
    if (typeof obj === 'object' && property) obj[property] = String(obj[property]);
  }
  const fuse = new Fuse(data, options);
  const result = fuse.search(String(searchString));
  const nearExactMatches = result.filter((item: { score: number }) => item.score < 0.001);
  const finalResult =
    getOnlyExactMatchIfExists && nearExactMatches.length > 0 ? nearExactMatches : result;
  return finalResult.map((item: GenDictionary) => item.item);
}
