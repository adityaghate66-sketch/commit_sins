// Safety net: koi bhi secret screen par aane se pehle yahan se guzrega.
// Backend se value pehle se masked aani chahiye, lekin agar galti se
// asli value aa jaye toh bhi poori kabhi dikhegi nahi.
export function maskSecret(value) {
  // Khali ya text nahi hai toh poora mask
  if (typeof value !== 'string' || value.length === 0) {
    return '************'
  }

  // Chhoti value (16 se kam akshar) ka koi hissa nahi dikhayenge,
  // kyunki chhote secret ke 8 akshar dikhana bhi bahut zyada hai.
  if (value.length < 16) {
    return '************'
  }

  // Lambi value: sirf pehle 4 aur aakhri 4 akshar, beech mein stars
  return `${value.slice(0, 4)}************${value.slice(-4)}`
}