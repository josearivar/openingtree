/**
 * Winning Chances Calculation
 * Based on Lichess's implementation: https://github.com/lichess-org/lila/pull/11148
 * 
 * Converts centipawn and mate scores to winning chances percentage
 */

const MULTIPLIER = -0.00368208;

/**
 * Calculate raw winning chances from centipawn score
 * @param {number} cp - Centipawn score
 * @returns {number} Winning chances from -1 to 1
 */
const rawWinningChances = (cp) => {
  return 2 / (1 + Math.exp(MULTIPLIER * cp)) - 1;
};

/**
 * Calculate winning chances from centipawn score (clamped)
 * @param {number} cp - Centipawn score
 * @returns {number} Winning chances from -1 to 1
 */
export const cpWinningChances = (cp) => {
  return rawWinningChances(Math.min(Math.max(-1000, cp), 1000));
};

/**
 * Calculate winning chances from mate score
 * @param {number} mate - Mate in N moves (positive for white, negative for black)
 * @returns {number} Winning chances from -1 to 1
 */
export const mateWinningChances = (mate) => {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  const signed = cp * (mate > 0 ? 1 : -1);
  return rawWinningChances(signed);
};

/**
 * Calculate winning chances from an evaluation score
 * @param {Object} score - Score object with either cp or mate property
 * @returns {number} Winning chances from -1 to 1
 */
export const evalWinningChances = (score) => {
  if (score.mate !== undefined) {
    return mateWinningChances(score.mate);
  }
  return cpWinningChances(score.cp || 0);
};

/**
 * Calculate winning chances for a specific color
 * @param {string} color - 'white' or 'black'
 * @param {Object} score - Score object with either cp or mate property
 * @returns {number} Winning chances from -1 to 1 (positive = winning for that color)
 */
export const povChances = (color, score) => {
  const chances = evalWinningChances(score);
  return color === 'white' ? chances : -chances;
};

/**
 * Convert winning chances to percentage for display
 * @param {number} chances - Winning chances from -1 to 1
 * @returns {number} Percentage from 0 to 100
 */
export const chancesToPercent = (chances) => {
  return Math.round((chances + 1) * 50);
};

/**
 * Format centipawn score for display
 * @param {number} cp - Centipawn score
 * @returns {string} Formatted score (e.g., "+1.5", "-0.3")
 */
export const formatCp = (cp) => {
  const value = Math.max(Math.min(Math.round(cp / 10) / 10, 99), -99);
  return (value > 0 ? '+' : '') + value.toFixed(1);
};

/**
 * Format evaluation score for display
 * @param {Object} score - Score object with either cp or mate property
 * @returns {string} Formatted score (e.g., "+1.5", "M3", "-M5")
 */
export const formatScore = (score) => {
  if (score.mate !== undefined) {
    const prefix = score.mate > 0 ? '' : '-';
    return prefix + 'M' + Math.abs(score.mate);
  }
  return formatCp(score.cp || 0);
};

/**
 * Get evaluation bar height percentage for white
 * @param {Object} score - Score object with either cp or mate property
 * @returns {number} Percentage from 0 to 100 (100 = white winning)
 */
export const getEvalBarPercent = (score) => {
  const chances = evalWinningChances(score);
  return chancesToPercent(chances);
};

export default {
  cpWinningChances,
  mateWinningChances,
  evalWinningChances,
  povChances,
  chancesToPercent,
  formatCp,
  formatScore,
  getEvalBarPercent
};
