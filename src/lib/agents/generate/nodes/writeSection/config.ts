// The numbers that control section writing. Change behaviour here.

/** A page longer than this is cut when shown to the writer (about 2,500 tokens). */
export const MAX_CHARS_PER_PAGE = 10_000;

/** All the material for one section together (about 6,000 tokens). */
export const MAX_CHARS_PER_SECTION = 24_000;

/** Text shown in place of a section that could not be written. */
export const COULD_NOT_WRITE =
  "_This section could not be written: none of its source pages could be read._";
