window.POS_SEED = (() => {
  const items = {};
  const cat = (id, name, children) => (items[id] = { type: 'category', name, children });
  const prd = (id, name, price, extra = {}) =>
    (items[id] = { type: 'product', name, price, children: [], ...extra });
  const grp = (id, name, groupType, min, max, children, extra = {}) =>
    (items[id] = { type: 'group', name, groupType, min, max, children, ...extra });

  cat('pos-cat-burgers', 'Burgers', ['pos-truffle', 'pos-cheeseburger', 'pos-mushroom-swiss', 'pos-beyond']);
  cat('pos-cat-pizza', 'Pizza', ['pos-byo-pizza', 'pos-margherita', 'pos-pepperoni-pizza']);
  cat('pos-cat-combos', 'Combos', ['pos-burger-combo']);
  cat('pos-cat-sides', 'Sides', ['pos-fries', 'pos-onion-rings', 'pos-caesar', 'pos-mac']);
  cat('pos-cat-drinks', 'Drinks', ['pos-lemonade-s', 'pos-lemonade-l', 'pos-iced-tea-s', 'pos-iced-tea-l', 'pos-ipa', 'pos-sparkling']);
  cat('pos-cat-desserts', 'Desserts', ['pos-lava-cake', 'pos-cheesecake']);
  cat('pos-cat-platters', 'Platters', ['pos-slider-platter', 'pos-wrap-platter']);

  prd('pos-truffle', 'Signature Truffle Burger', 18.5, {
    description: 'Wagyu patty, truffle aioli, aged gruyère, and caramelized onions on a brioche bun.',
    children: ['pos-g-temp', 'pos-g-side', 'pos-g-addons', 'pos-g-sauce'],
  });
  prd('pos-cheeseburger', 'Classic Cheeseburger', 14, {
    description: 'Two smashed patties, American cheese, pickles, and house sauce.',
    children: ['pos-g-temp', 'pos-g-side', 'pos-g-addons', 'pos-g-sauce'],
  });
  prd('pos-mushroom-swiss', 'Mushroom Swiss Burger', 15.5, {
    description: 'Roasted cremini mushrooms, Swiss cheese, and garlic mayo.',
    children: ['pos-g-side', 'pos-g-addons'],
  });
  prd('pos-beyond', 'Beyond Burger', 16, {
    description: 'Plant-based patty with vegan cheddar and smoky tomato jam.',
    children: ['pos-g-side'],
  });

  grp('pos-g-temp', 'Meat Temperature', 1, 1, 1, ['pos-m-rare', 'pos-m-medrare', 'pos-m-medium', 'pos-m-well']);
  prd('pos-m-rare', 'Rare', 0);
  prd('pos-m-medrare', 'Medium Rare', 0);
  prd('pos-m-medium', 'Medium', 0);
  prd('pos-m-well', 'Well Done', 0);

  grp('pos-g-side', 'Choice of Side', 1, 1, 1, ['pos-m-fries', 'pos-m-salad', 'pos-m-loaded']);
  prd('pos-m-fries', 'French Fries', 0);
  prd('pos-m-salad', 'House Salad', 2, { children: ['pos-g-dressing'] });
  prd('pos-m-loaded', 'Loaded Fries', 4.5, { children: ['pos-g-loaded-top'] });

  grp('pos-g-dressing', 'Dressing', 1, 1, 1, ['pos-m-ranch', 'pos-m-balsamic', 'pos-m-caesar-dr']);
  prd('pos-m-ranch', 'Ranch', 0);
  prd('pos-m-balsamic', 'Balsamic Vinaigrette', 0);
  prd('pos-m-caesar-dr', 'Caesar', 0);

  grp('pos-g-loaded-top', 'Toppings', 1, 0, 3, ['pos-m-bacon-bits', 'pos-m-cheese', 'pos-m-jalapeno'], { free: 1 });
  prd('pos-m-bacon-bits', 'Bacon Bits', 0.75);
  prd('pos-m-cheese', 'Extra Cheese', 1);
  prd('pos-m-jalapeno', 'Jalapeños', 0.5);

  grp('pos-g-addons', 'Burger Add-ons', 1, 0, 4, ['pos-m-bacon', 'pos-m-avocado', 'pos-m-egg', 'pos-m-cheese']);
  prd('pos-m-bacon', 'Applewood Bacon', 2.5);
  prd('pos-m-avocado', 'Avocado', 2);
  prd('pos-m-egg', 'Fried Egg', 1.5);

  grp('pos-g-sauce', 'Sauces', 1, 0, 3, ['pos-m-ketchup', 'pos-m-aioli', 'pos-m-chipotle']);
  prd('pos-m-ketchup', 'Ketchup', 0);
  prd('pos-m-aioli', 'Truffle Aioli', 0.75);
  prd('pos-m-chipotle', 'Chipotle Mayo', 0.5);

  prd('pos-byo-pizza', 'Build Your Own Pizza', 12, {
    description: 'Start with our 48-hour dough and make it yours.',
    children: ['pos-g-size-pizza', 'pos-g-crust', 'pos-g-toppings'],
  });
  prd('pos-margherita', 'Margherita', 14, {
    description: 'San Marzano tomato, fior di latte, basil, and olive oil.',
    children: ['pos-g-size-pizza'],
  });
  prd('pos-pepperoni-pizza', 'Pepperoni Pizza', 15, {
    description: 'Cup-and-char pepperoni with hot honey.',
    children: ['pos-g-size-pizza'],
  });

  grp('pos-g-size-pizza', 'Pizza Size', 2, 1, 1, ['pos-m-10', 'pos-m-12', 'pos-m-14']);
  prd('pos-m-10', 'Personal 10"', 0);
  prd('pos-m-12', 'Medium 12"', 3);
  prd('pos-m-14', 'Large 14"', 6);

  grp('pos-g-crust', 'Crust', 1, 1, 1, ['pos-m-thin', 'pos-m-handtossed', 'pos-m-stuffed'], { autoAdded: ['pos-m-handtossed'] });
  prd('pos-m-thin', 'Thin Crust', 0);
  prd('pos-m-handtossed', 'Hand-Tossed', 0);
  prd('pos-m-stuffed', 'Stuffed Crust', 4, { children: ['pos-g-stuffing'] });

  grp('pos-g-stuffing', 'Stuffing', 1, 1, 1, ['pos-m-stuff-mozz', 'pos-m-stuff-pep']);
  prd('pos-m-stuff-mozz', 'Mozzarella', 0);
  prd('pos-m-stuff-pep', 'Pepperoni and Cheese', 1);

  grp('pos-g-toppings', 'Pizza Toppings', 1, 0, 6,
    ['pos-m-pepperoni', 'pos-m-mushroom', 'pos-m-onion', 'pos-m-olive', 'pos-m-sausage', 'pos-m-basil'],
    { free: 2, maxSingle: 2 });
  prd('pos-m-pepperoni', 'Pepperoni', 1.5);
  prd('pos-m-mushroom', 'Mushrooms', 1);
  prd('pos-m-onion', 'Red Onion', 1);
  prd('pos-m-olive', 'Kalamata Olives', 1);
  prd('pos-m-sausage', 'Italian Sausage', 1.5);
  prd('pos-m-basil', 'Fresh Basil', 0.5);

  prd('pos-burger-combo', 'Burger Combo', 19, {
    description: 'A burger, a side, and a drink.',
    children: ['pos-g-combo-burger', 'pos-g-combo-side', 'pos-g-combo-drink'],
  });
  grp('pos-g-combo-burger', 'Choose Your Burger', 3, 1, 1, ['pos-cheeseburger', 'pos-mushroom-swiss'],
    { childPrices: { 'pos-cheeseburger': 0, 'pos-mushroom-swiss': 1.5 } });
  grp('pos-g-combo-side', 'Choose Your Side', 3, 1, 1, ['pos-fries', 'pos-onion-rings'],
    { childPrices: { 'pos-fries': 0, 'pos-onion-rings': 1 } });
  grp('pos-g-combo-drink', 'Choose Your Drink', 3, 1, 1, ['pos-lemonade-s', 'pos-iced-tea-s', 'pos-sparkling'],
    { childPrices: { 'pos-lemonade-s': 0, 'pos-iced-tea-s': 0, 'pos-sparkling': 0 } });

  prd('pos-fries', 'FF REG', 4.5);
  prd('pos-onion-rings', 'ONION RNGS', 5.5);
  prd('pos-caesar', 'Caesar Salad', 8, {
    description: 'Little gem, parmesan, garlic croutons.',
    children: ['pos-g-dressing'],
  });
  prd('pos-mac', 'MAC N CHS', 6);

  prd('pos-lemonade-s', 'SML LMNADE', 3);
  prd('pos-lemonade-l', 'LRG LMNADE', 4.5);
  prd('pos-iced-tea-s', 'SML ICD TEA', 2.75);
  prd('pos-iced-tea-l', 'LRG ICD TEA', 4);
  prd('pos-ipa', 'IPA DRFT 16OZ', 7.5);
  prd('pos-sparkling', 'SPRKLNG WTR', 3);

  prd('pos-lava-cake', 'Chocolate Lava Cake', 8, {
    description: 'Warm dark chocolate cake with a molten center.',
    children: ['pos-g-scoop'],
  });
  grp('pos-g-scoop', 'Add a Scoop', 1, 0, 2, ['pos-m-vanilla', 'pos-m-whip']);
  prd('pos-m-vanilla', 'Vanilla Ice Cream', 2);
  prd('pos-m-whip', 'Whipped Cream', 1);
  prd('pos-cheesecake', 'NY CHSCAKE', 7.5);

  prd('pos-slider-platter', 'SLIDER PLTR 12CT', 48);
  prd('pos-wrap-platter', 'WRAP PLTR', 42);

  return {
    syncedAt: Date.now() - 1000 * 60 * 42,
    syncCount: 0,
    priceGaps: {
      'pos-ipa': { every: 16, offset: 3, reason: 'No liquor license' },
      'pos-lemonade-l': { every: 54, offset: 7, reason: 'Not on the POS price list' },
    },
    menus: [
      { id: 'pos-menu-main', name: 'Main', image: 'img/pos/menu-burger.svg', roots: ['pos-cat-burgers', 'pos-cat-pizza', 'pos-cat-combos', 'pos-cat-sides', 'pos-cat-drinks', 'pos-cat-desserts'] },
      { id: 'pos-menu-catering', name: 'Catering', image: 'img/pos/menu-catering.svg', roots: ['pos-cat-platters'] },
    ],
    items,
  };
})();

window.EXAMPLE_PRODUCTS = {
  'pos-truffle': { allergens: ['milk', 'wheat', 'eggs'], caloriesFrom: 980 },
  'pos-cheeseburger': { allergens: ['milk', 'wheat', 'sesame'], caloriesFrom: 860 },
  'pos-mushroom-swiss': { allergens: ['milk', 'wheat', 'eggs'] },
  'pos-beyond': { allergens: ['wheat', 'soybeans'], foodType: 'vegan' },
  'pos-m-egg': { allergens: ['eggs'] },
  'pos-m-aioli': { allergens: ['eggs'] },
  'pos-m-chipotle': { allergens: ['eggs'] },
  'pos-margherita': { allergens: ['milk', 'wheat'], foodType: 'vegetarian' },
  'pos-fries': { caloriesFrom: 420 },
  'pos-lemonade-s': { caloriesFrom: 120, foodType: 'vegan' },
  'pos-lemonade-l': { caloriesFrom: 210, foodType: 'vegan' },
  'pos-iced-tea-s': { foodType: 'vegan' },
  'pos-iced-tea-l': { foodType: 'vegan' },
  'pos-ipa': { isAlcoholic: true },
  'pos-sparkling': { foodType: 'vegan' },
  'pos-lava-cake': { allergens: ['milk', 'eggs', 'wheat'], foodType: 'vegetarian' },
  'pos-m-vanilla': { allergens: ['milk'] },
  'pos-m-whip': { allergens: ['milk'] },
  'pos-cheesecake': { allergens: ['milk', 'eggs', 'wheat'] },
  'pos-slider-platter': { allergens: ['milk', 'wheat'] },
  'pos-wrap-platter': { allergens: ['wheat'] },
};

window.MENU_SUGGESTIONS = {
  names: {
    'pos-fries': 'French Fries',
    'pos-onion-rings': 'Onion Rings',
    'pos-mac': 'Mac and Cheese',
    'pos-lemonade-s': 'Small Lemonade',
    'pos-lemonade-l': 'Large Lemonade',
    'pos-iced-tea-s': 'Small Iced Tea',
    'pos-iced-tea-l': 'Large Iced Tea',
    'pos-ipa': 'Craft IPA (16 oz)',
    'pos-sparkling': 'Sparkling Water',
    'pos-cheesecake': 'New York Cheesecake',
    'pos-slider-platter': 'Slider Platter (12 sliders)',
    'pos-wrap-platter': 'Wrap Platter',
  },
  bases: {
    LMNADE: 'Lemonade',
    'ICD TEA': 'Iced Tea',
  },
  descriptions: {
    'pos-fries': 'Hand-cut and double-fried, finished with sea salt.',
    'pos-onion-rings': 'Thick-cut sweet onions in a crisp beer batter.',
    'pos-mac': 'Elbow pasta baked in a three-cheese sauce.',
    'pos-lemonade-s': 'Fresh-squeezed lemons, lightly sweetened.',
    'pos-lemonade-l': 'Fresh-squeezed lemons, lightly sweetened.',
    'pos-iced-tea-s': 'Fresh-brewed black tea over ice.',
    'pos-iced-tea-l': 'Fresh-brewed black tea over ice.',
    'pos-ipa': 'A rotating local IPA, poured on draft.',
    'pos-sparkling': 'Chilled sparkling mineral water.',
    'pos-cheesecake': 'Creamy New York–style cheesecake on a graham cracker crust.',
    'pos-slider-platter': 'Twelve mini cheeseburgers with pickles and house sauce.',
    'pos-wrap-platter': 'An assortment of chicken, veggie, and turkey wraps.',
  },
};

window.MENU_CONSTANTS = {
  orderTypes: [
    ['dine_in', 'Dine-in (FS)'],
    ['preorder', 'Dine-in (QS)'],
    ['take_out', 'Takeout'],
    ['delivery', 'Delivery'],
    ['curbside', 'Curbside pickup'],
    ['catering_delivery', 'Catering delivery'],
    ['catering_take_out', 'Catering pickup'],
    ['drive_thru', 'Drive-thru'],
  ],
  channels: [
    ['web', 'Web App'],
    ['mobile', 'Mobile App'],
    ['kiosk', 'Kiosk'],
    ['ordering_api', 'Ordering API'],
    ['call_center', 'Order Desk'],
  ],
  segmentTags: ['Corporate accounts', 'Loyalty members', 'Staff'],
  orderTypeChannels: {
    dine_in: ['mobile', 'web', 'kiosk'],
    take_out: ['mobile', 'web', 'kiosk'],
    delivery: ['mobile', 'web'],
    curbside: ['mobile', 'web'],
    catering_delivery: ['mobile', 'web'],
    catering_take_out: ['mobile', 'web'],
    drive_thru: ['mobile', 'web'],
  },
  deliveryPartners: [
    ['doordash', 'DoorDash'],
    ['ubereats', 'Uber Eats'],
    ['grubhub', 'Grubhub'],
  ],
  menuStoreGroups: [
    { id: 'msg-east', name: 'East Coast', cities: ['New York', 'Boston', 'Atlanta', 'Charlotte', 'Tampa', 'Raleigh', 'Miami'] },
    { id: 'msg-central', name: 'Central', cities: ['Chicago', 'Austin', 'Dallas', 'Columbus', 'Nashville', 'Kansas City', 'Indianapolis'] },
    { id: 'msg-west', name: 'West', cities: ['San Francisco', 'Denver', 'Phoenix', 'Portland', 'Salt Lake City', 'Seattle'] },
    { id: 'msg-airports', name: 'Airport stores', airport: true },
  ],
  stores: (() => {
    const cities = [
      ['New York', 1.1], ['San Francisco', 1.1], ['Boston', 1.1], ['Chicago', 1.1], ['Austin', 1], ['Denver', 1],
      ['Phoenix', 1], ['Atlanta', 1], ['Dallas', 1], ['Columbus', 1], ['Nashville', 1], ['Charlotte', 1],
      ['Tampa', 1], ['Portland', 1], ['Kansas City', 1], ['Raleigh', 1], ['Salt Lake City', 1], ['Indianapolis', 1],
      ['Miami', 1.05], ['Seattle', 1.05],
    ];
    return Array.from({ length: 480 }, (_, i) => {
      const [city, cityFactor] = cities[i % cities.length];
      const n = Math.floor(i / cities.length) + 1;
      const airport = i % 37 === 13;
      const value = !airport && i % 23 === 5;
      return {
        id: `st-${String(i + 1).padStart(3, '0')}`,
        index: i,
        city,
        name: airport ? `${city} Airport` : `${city} #${String(n).padStart(2, '0')}`,
        airport,
        factor: airport ? 1.2 : value ? 0.95 : cityFactor,
      };
    });
  })(),
  foodTypes: [
    ['vegan', 'Vegan'],
    ['vegetarian', 'Vegetarian'],
  ],
  allergens: [
    'milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'gluten', 'soybeans',
    'sesame', 'sulfites', 'mustard', 'celery', 'lupin',
  ],
  allergenLabels: {
    tree_nuts: 'Tree nuts',
    soybeans: 'Soy',
  },
  modifierCodes: [
    ['no', 'No'],
    ['light', 'Light'],
    ['extra', 'Extra'],
    ['side', 'On the side'],
  ],
  tags: [
    { key: 'Badge', values: ['New', 'Popular', 'Chef’s pick'] },
    { key: 'Spice level', values: ['Mild', 'Medium', 'Hot'] },
  ],
  prepStations: [
    ['ps-grill', 'Grill'],
    ['ps-fryer', 'Fryer'],
    ['ps-cold', 'Cold station'],
    ['ps-bar', 'Bar'],
    ['ps-packing', 'Packing'],
  ],
  prepUnits: ['oz', 'lb', 'g', 'kg', 'ml', 'l', 'cups', 'ea'],
  storeGroups: [
    { id: 'sg-corporate', name: 'Corporate stores', pos: 'PAR POS', dataset: 'example' },
    { id: 'sg-airport', name: 'Airport concessions', pos: 'PAR POS', dataset: 'example' },
    { id: 'sg-cravewave', name: 'Cravewave Pizza', pos: 'PAR Brink', dataset: 'cravewave' },
  ],
  groupTypes: {
    1: { label: 'Modifier', help: 'Extras and choices that change the product.' },
    2: { label: 'Size', help: 'Size variants. Customers pick exactly one.' },
    3: { label: 'Combo', help: 'A slot in a combo meal, filled by another product.' },
  },
};
