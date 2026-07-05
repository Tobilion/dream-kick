/** names.js — regional name pools for procedural squad generation. */

export const NAME_POOLS = {
  england: {
    first: ['Harry', 'Jack', 'Jordan', 'Marcus', 'Declan', 'Phil', 'Mason', 'Bukayo', 'Reece', 'Kyle', 'Ollie', 'Callum', 'Aaron', 'Ben', 'Conor', 'James', 'Trent', 'Jude', 'Cole', 'Eddie'],
    last: ['Kane', 'Walker', 'Rice', 'Foden', 'Saka', 'James', 'Mount', 'Grealish', 'Stones', 'Henderson', 'Watkins', 'Palmer', 'Gordon', 'Bowen', 'Maddison', 'Ramsdale', 'Pickford', 'Trippier', 'Gallagher', 'Toney'],
  },
  spain: {
    first: ['Pedri', 'Gavi', 'Alvaro', 'Mikel', 'Dani', 'Pablo', 'Sergio', 'Marco', 'Nico', 'Ferran', 'Unai', 'Rodri', 'Iker', 'David', 'Marcos', 'Alejandro', 'Fabian', 'Jesus', 'Jose', 'Raul'],
    last: ['Garcia', 'Torres', 'Olmo', 'Merino', 'Ruiz', 'Navas', 'Llorente', 'Asensio', 'Williams', 'Simon', 'Laporte', 'Carvajal', 'Morata', 'Oyarzabal', 'Zubimendi', 'Fornals', 'Canales', 'Sarabia', 'Gaya', 'Moreno'],
  },
  brazil: {
    first: ['Vini', 'Gabriel', 'Lucas', 'Rodrygo', 'Bruno', 'Casemiro', 'Eder', 'Raphinha', 'Antony', 'Richarlison', 'Neymar', 'Thiago', 'Marquinhos', 'Fabinho', 'Alisson', 'Ederson', 'Danilo', 'Alex', 'Joelinton', 'Matheus'],
    last: ['Silva', 'Santos', 'Jesus', 'Martinelli', 'Paqueta', 'Militao', 'Guimaraes', 'Cunha', 'Telles', 'Ribeiro', 'Araujo', 'Nunes', 'Pereira', 'Costa', 'Oliveira', 'Souza', 'Lima', 'Barbosa', 'Rocha', 'Almeida'],
  },
  france: {
    first: ['Kylian', 'Antoine', 'Aurelien', 'Eduardo', 'Ousmane', 'Kingsley', 'Adrien', 'Jules', 'Theo', 'William', 'Randal', 'Marcus', 'Youssouf', 'Ibrahima', 'Dayot', 'Mike', 'Alphonse', 'Olivier', 'Moussa', 'Ferland'],
    last: ['Mbappe', 'Griezmann', 'Tchouameni', 'Camavinga', 'Dembele', 'Coman', 'Rabiot', 'Kounde', 'Hernandez', 'Saliba', 'Kolo Muani', 'Thuram', 'Fofana', 'Konate', 'Upamecano', 'Maignan', 'Areola', 'Giroud', 'Diaby', 'Mendy'],
  },
  germany: {
    first: ['Jamal', 'Florian', 'Joshua', 'Leon', 'Kai', 'Serge', 'Leroy', 'Niclas', 'Jonathan', 'Antonio', 'Manuel', 'Marc', 'Nico', 'Robin', 'David', 'Pascal', 'Maximilian', 'Julian', 'Deniz', 'Karim'],
    last: ['Musiala', 'Wirtz', 'Kimmich', 'Goretzka', 'Havertz', 'Gnabry', 'Sane', 'Fullkrug', 'Tah', 'Rudiger', 'Neuer', 'ter Stegen', 'Schlotterbeck', 'Gosens', 'Raum', 'Gross', 'Mittelstadt', 'Brandt', 'Undav', 'Adeyemi'],
  },
  italy: {
    first: ['Federico', 'Nicolo', 'Sandro', 'Alessandro', 'Giovanni', 'Lorenzo', 'Matteo', 'Davide', 'Gianluigi', 'Ciro', 'Giacomo', 'Manuel', 'Bryan', 'Destiny', 'Riccardo', 'Guglielmo', 'Andrea', 'Marco', 'Domenico', 'Mateo'],
    last: ['Chiesa', 'Barella', 'Tonali', 'Bastoni', 'Di Lorenzo', 'Pellegrini', 'Politano', 'Frattesi', 'Donnarumma', 'Immobile', 'Raspadori', 'Locatelli', 'Cristante', 'Udogie', 'Calafiori', 'Vicario', 'Cambiaso', 'Verratti', 'Berardi', 'Retegui'],
  },
  africa: {
    first: ['Mohamed', 'Sadio', 'Victor', 'Achraf', 'Riyad', 'Kalidou', 'Thomas', 'Andre', 'Sofyan', 'Yves', 'Ismaila', 'Sebastien', 'Franck', 'Nicolas', 'Wilfred', 'Alex', 'Taiwo', 'Samuel', 'Iheanacho', 'Ademola'],
    last: ['Salah', 'Mane', 'Osimhen', 'Hakimi', 'Mahrez', 'Koulibaly', 'Partey', 'Onana', 'Amrabat', 'Bissouma', 'Sarr', 'Haller', 'Kessie', 'Jackson', 'Ndidi', 'Iwobi', 'Awoniyi', 'Chukwueze', 'Kelechi', 'Lookman'],
  },
  southamerica: {
    first: ['Lionel', 'Julian', 'Enzo', 'Alexis', 'Rodrigo', 'Lautaro', 'Emiliano', 'Nicolas', 'Federico', 'Darwin', 'Ronald', 'Luis', 'Miguel', 'Davinson', 'Radamel', 'James', 'Arturo', 'Eduardo', 'Piero', 'Moises'],
    last: ['Messi', 'Alvarez', 'Fernandez', 'Mac Allister', 'De Paul', 'Martinez', 'Romero', 'Valverde', 'Nunez', 'Araujo', 'Suarez', 'Diaz', 'Almiron', 'Sanchez', 'Falcao', 'Rodriguez', 'Vidal', 'Vargas', 'Hincapie', 'Caicedo'],
  },
};

export const REGIONS = Object.keys(NAME_POOLS);

/** Build a unique-ish display name from a region pool. */
export function buildName(rng, region, used) {
  const pool = NAME_POOLS[region] || NAME_POOLS.england;
  for (let i = 0; i < 24; i++) {
    const f = pool.first[Math.floor(rng() * pool.first.length)];
    const l = pool.last[Math.floor(rng() * pool.last.length)];
    const name = `${f[0]}. ${l}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  const fallback = `${pool.first[0][0]}. ${pool.last[Math.floor(rng() * pool.last.length)]} Jr`;
  used.add(fallback);
  return fallback;
}
