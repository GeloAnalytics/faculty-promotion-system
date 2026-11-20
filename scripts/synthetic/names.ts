import type { Rng } from './rng';

const FEMALE = ['Maricel', 'Rowena', 'Jocelyn', 'Marites', 'Lorna', 'Cecilia', 'Evelyn', 'Nilda', 'Gemma', 'Roselle', 'Divina', 'Corazon', 'Analyn', 'Leonora', 'Glenda', 'Marilou', 'Teresita', 'Rosalinda', 'Amelita', 'Josefina', 'Fe', 'Lourdes', 'Erlinda', 'Noemi', 'Cherry', 'Jennylyn', 'Kristine', 'Mylene', 'Aileen', 'Carmela'];
const MALE = ['Rodrigo', 'Benedicto', 'Allan', 'Ricardo', 'Dennis', 'Armando', 'Efren', 'Joselito', 'Reynaldo', 'Narciso', 'Florante', 'Arnel', 'Romeo', 'Edgardo', 'Bernardo', 'Lorenzo', 'Teodoro', 'Virgilio', 'Rommel', 'Jericho', 'Marlon', 'Gilbert', 'Randolph', 'Cesar', 'Wilfredo', 'Anselmo', 'Nestor', 'Orlando', 'Felix', 'Dionisio'];
const SURNAMES = ['Dimaculangan', 'Bautista', 'Magsino', 'Villanueva', 'Catapang', 'Macaraig', 'Reyes', 'Asuncion', 'Maghirang', 'Landicho', 'Panganiban', 'Atienza', 'Dalisay', 'Evangelista', 'Fernandez', 'Gatdula', 'Hernandez', 'Ilagan', 'Jacinto', 'Kalaw', 'Lacsamana', 'Mercado', 'Natividad', 'Ocampo', 'Pascual', 'Quiambao', 'Rellosa', 'Salvador', 'Tolentino', 'Umali', 'Velasco', 'Yambao', 'Zaballa', 'Abrenica', 'Barrion', 'Cabrera', 'Dizon', 'Estrada', 'Flores', 'Gonzales', 'Hizon', 'Ignacio', 'Lopez', 'Mendoza', 'Navarro', 'Olivares', 'Perez', 'Ramos', 'Sarmiento', 'Tañada', 'Urbano', 'Valdez', 'Aguilar', 'Briones', 'Castillo', 'Delos Santos', 'Enriquez', 'Francisco', 'Garcia', 'Hidalgo', 'Inocencio', 'Javier', 'Lazaro', 'Manalo', 'Nolasco', 'Orbase', 'Padilla', 'Ronquillo', 'Santos', 'Torres', 'Unson', 'Vergara'];
const MIDDLE_INITIALS = 'ABCDEFGHJLMNOPRSTV'.split('');

export interface FictionalName {
  first: string;
  middleInitial: string;
  last: string;
  sex: 'F' | 'M';
  full: string;
}

export function pickName(rng: Rng, taken: Set<string>): FictionalName {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const sex: 'F' | 'M' = rng.chance(0.55) ? 'F' : 'M';
    const first = rng.pick(sex === 'F' ? FEMALE : MALE);
    const last = rng.pick(SURNAMES);
    const middleInitial = rng.pick(MIDDLE_INITIALS);
    const full = `${first} ${middleInitial}. ${last}`;
    if (!taken.has(full.toLowerCase())) {
      taken.add(full.toLowerCase());
      return { first, middleInitial, last, sex, full };
    }
  }
  throw new Error('Ran out of unique synthetic names');
}

export function pickSignatory(rng: Rng): string {
  const sex = rng.chance(0.5) ? FEMALE : MALE;
  const title = rng.pick(['Dr.', 'Dr.', 'Engr.', 'Prof.', 'Atty.']);
  return `${title} ${rng.pick(sex)} ${rng.pick(MIDDLE_INITIALS)}. ${rng.pick(SURNAMES)}`.toUpperCase();
}
