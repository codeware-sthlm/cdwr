/** The Codeware cloud, rendered once from assets/cdwr-cloud.png as braille */
export const CLOUD = [
  '         ⢀⣤⣶⣾⣿⠿⠿⠿⢶⣦⣄',
  '       ⢀⣾⠟⠋⠀⣸⣿⣀⠀⠀⠀⠈⠛⢿⣦',
  '   ⢀⣤⣴⣶⣿⠃⠀⢀⣾⠟⠙⢻⣧⠀⠀⠀⠀⠀⢻⣷⡀',
  ' ⢠⣾⠟⠋⠁⣿⠇⠀⠀⠀⢿⣦⣤⣼⡟⠀⠀⠀⠀⢀⣀⣿⣇',
  '⢰⣿⠃⠀⠀⣼⣿⣶⣦⡀⠀⠀⠉⠉⠁⠀⠀⢠⣴⡿⠟⠛⠛⠻⢿⣦⡀',
  '⣿⡇⠀⠀⣼⡟⠀⠀⠙⣿⠀⠀⠀⠀⠀⠀⣰⡿⠃⠀⢀⣴⣶⣶⣄⠙⢿⣆',
  '⣿⡇⠀⠀⠘⣿⣤⣤⣾⠟⠀⠀⠀⠀⢀⣠⣿⣇⠀⠀⣿⡏⠀⢈⣿⠆⢸⣿',
  '⠹⣷⡀⠀⠀⠀⠉⠉⠁⠀⠀⠀⠀⠀⣿⠏⠉⢻⣧⠀⠘⠻⣿⡿⠋⠀⢸⣿',
  ' ⠙⢿⣦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠻⣷⣤⣾⠏⠀⠀⠀⣿⡇⢀⣴⡿⠃',
  '   ⠙⠻⠿⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣷⣶⣶⣶⣶⣶⣿⡿⠟⠋'
];

/** Width of the widest line, in terminal cells */
export const CLOUD_WIDTH = Math.max(...CLOUD.map((line) => line.length));
