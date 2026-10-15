/**
 * GAP-051 load-more test-data seed (author-authorized 2026-10-13).
 *
 * Creates in the ACCEPTANCE database, via the RUNNING API (real routes,
 * real validation, real publication flow):
 *  - 1 flagship novel with 10 full-length Indonesian webnovel chapters;
 *  - 20 clearly-labelled slim published novels so /browse (page size 20)
 *    crosses the pagination threshold and the load-more control renders.
 *
 * Auth: mints a session row for the workspace OWNER (same mechanism as
 * apps/api/src/e2e/setup.ts — generateSessionToken/hashSessionToken from
 * @novelforge/auth); no password handling.
 *
 * Usage:
 *   DATABASE_URL=postgresql://novelforge:novelforge@localhost:5433/novelforge_acceptance_050b \
 *   node --experimental-transform-types scripts/gap051-loadmore-seed.ts
 *
 * Purge: delete the novels titled "GAP-051 …" through the platform UI/API;
 * chapter/publication rows cascade with their novel.
 */
import pg from "pg";
import { generateSessionToken, hashSessionToken } from "@novelforge/auth";

const API = process.env.GAP051_API ?? "http://localhost:3000";
const WORKSPACE_ID = "b1ff1cbc-a8af-44ce-8bd7-4e4e260beda9";
const OWNER_ID = "5e79ddc4-841c-4a77-8b4c-5d0169793ab5";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://novelforge:novelforge@localhost:5433/novelforge_acceptance_050b";

async function mintSession(): Promise<string> {
  const token = generateSessionToken();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '2 hours')",
    [hashSessionToken(token), OWNER_ID],
  );
  await client.end();
  return token;
}

function api(token: string) {
  const call = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> => {
    // The API registers @fastify/rate-limit (300 req/min outside test env);
    // the seed bursts far past that, so 429s are expected and retried.
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}/api${path}`, {
        method,
        headers: {
          ...(body === undefined
            ? {}
            : { "content-type": "application/json" }),
          cookie: `nf_session=${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 60) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      }
      return text ? JSON.parse(text) : undefined;
    }
  };
  return call;
}

async function publishNovel(
  call: (m: string, p: string, b?: unknown) => Promise<unknown>,
  title: string,
  slug: string,
  chapters: Array<{ title: string; text: string }>,
): Promise<{ novelId: string; chapters: number; words: number }> {
  const novel = (await call(
    "POST",
    `/workspaces/${WORKSPACE_ID}/novels`,
    { title, slug },
  )) as { id: string };
  let words = 0;
  for (const ch of chapters) {
    const chapter = (await call(
      "POST",
      `/workspaces/${WORKSPACE_ID}/novels/${novel.id}/chapters`,
      { title: ch.title },
    )) as { id: string };
    await call(
      "PUT",
      `/workspaces/${WORKSPACE_ID}/novels/${novel.id}/chapters/${chapter.id}`,
      { content: ch.text, expectedVersion: null },
    );
    // Publish gate (Invariant 3): a PASS final-text-review receipt is
    // required for the current version before publishChapter succeeds.
    // GET chapter returns currentVersion as a NUMBER, so the version row
    // id is resolved directly from the acceptance DB (read-only select).
    const dbClient = new pg.Client({ connectionString: DATABASE_URL });
    await dbClient.connect();
    const vr = await dbClient.query(
      "SELECT id FROM chapter_versions WHERE chapter_id = $1 ORDER BY number DESC LIMIT 1",
      [chapter.id],
    );
    await dbClient.end();
    const versionId = vr.rows[0]?.id as string | undefined;
    if (!versionId) throw new Error(`chapter ${chapter.id} has no version row after save`);
    await call(
      "POST",
      `/workspaces/${WORKSPACE_ID}/novels/${novel.id}/chapters/${chapter.id}/final-text-review`,
      { chapterVersionId: versionId },
    );
    await call(
      "POST",
      `/workspaces/${WORKSPACE_ID}/novels/${novel.id}/chapters/${chapter.id}/publication/publish`,
    );
    words += ch.text.split(/\s+/).filter(Boolean).length;
  }
  return { novelId: novel.id, chapters: chapters.length, words };
}

// --- Flagship novel: "Lentera Menara Kelabu" (10 chapters, Indonesian) ---

const FLAGSHIP: Array<{ title: string; text: string }> = [
  {
    title: "Bab 1 — Lentera Terakhir",
    text: `Hujan turun sejak subuh, dan Menara Kelabu berdiri diam menahannya seperti sudah berdiri diam selama seratus tahun. Elang menaiki tangga kayu gudang lantai tiga sambil memegang lentera berkarat itu dengan dua tangan. Logamnya dingin, lebih dingin dari udara hujan, dan di dasarnya ada ukiran setengah terhapus: sebuah nama yang ia kenal lebih baik daripada namanya sendiri.

"Ibu," bisiknya.

Gudang itu bau minyak ikan, tali basah, dan kertas lama. Sejak ibunya hilang tiga tahun lalu, tidak ada seorang pun yang berani menyentuh petak-petak peninggalannya. Para penjaga menara menganggapnya tidak pantas disentuh; ayahnya menganggapnya terlalu menyakitkan untuk dilihat. Hanya Elang yang setiap kali lewat menoleh, seperti seseorang yang menunggu pintu tua bersuara.

Malam itu lampu minyak di tangganya padam. Angin dari celah dinding masuk, dan bukannya meniup bara, ia menyentuh lentera itu—dan lentera itu menyala.

Tanpa minyak. Tanpa sumbu. Cahayanya putih keperakan, lembut, seperti bulan yang tersesat dan memilih berteduh di gudang.

Elang mundur selangkah, punggungnya membentur rak tali. Jantungnya berdebar bukan karena takut saja, tetapi karena di dalam ketakutan itu ada sesuatu yang lebih tua dan lebih pasti: ia pernah melihat cahaya seperti ini. Dulu, saat masih kecil, saat ibunya masih ada, di malam yang oleh orang dewasa selalu disebut mimpi buruk.

"Lentera jangan disentuh!" Suara Ki Darmo menyeruak dari bawah, disusul derap tangga yang berat. Penjaga tua itu naik dengan pelita di tangan, dan wajahnya—wajah yang biasanya tenang seperti air kolam—mengeras ketika melihat cahaya keperakan itu.

"Ki, aku tidak sengaja—"

"Bawa turun." Suara Ki Darmo rendah, memotong. "Jangan lewat depan jendela. Jangan lewat cermin. Turun, sekarang."

Elang mematuhi. Di tangga, cahaya keperakan itu menembus celah jarinya, hangat, seperti tangan yang dulu menuntunnya menyeberangi jembatan pasar. Ki Darmo berjalan di belakangnya sepanjang koridor, menyalakan lampu-lampu di setiap tiang, seolah ingin mengubur cahaya aneh itu di bawah terang biasa.

Di dapur, di bawah satu lampu gantung, Ki Darmo memandangi lentera lama sebelum akhirnya menghela napas. "Kau tahu kenapa menara ini bernama Menara Kelabu?"

"Karena batunya?"

"Karena asap." Ki Darmo duduk. "Dulu ada penyulut besar di puncaknya. Api yang harus menyala terus selama perang lama. Saat perang usai, api dipadamkan, dan asapnya—mereka bilang—masih turun sampai sekarang. Tak terlihat. Tapi ia masuk ke mimpian orang-orang yang tinggal di menara ini."

"Yang menyala tadi bukan api," kata Elang pelan. "Tidak panas."

"Itu sebabnya aku bilang jangan disentuh." Ki Darmo memijat pelipisnya. "Lentera itu milik ibumu. Yang kedua. Yang pertama menyala di puncak menara di malam saat perang usai—malam saat ibumu tidak kembali."

Dapur itu sunyi lama. Di luar, hujan menipis menjadi gerimis, dan gerimis itu menjadi kabut.

"Kalau begitu ia meninggalkan ini untukku," kata Elang akhirnya. Bukan pertanyaan. Suaranya kecil, tetapi tidak goyah, dan pada suara yang tidak goyah itu Ki Darmo menutup matanya sejenak, karena ia mendengar suara perempuan yang dulu juga begitu bicara.

"Mungkin." Ki Darmo bangkit, menggantung kuncinya di paku dinding. "Tapi pendengar cerita seperti itu bukan aku. Besok pagi, ada surat yang datang untukmu. Sudah tiga kali dicoba dibawa kurir, dan tiga kali dipulangkan karena alamatnya... menolak."

"Menolak?"

"Besok kau lihat sendiri." Di ambang pintu, Ki Darmo berhenti. "Dan Elang—lentera itu, simpan baik-baik. Jauhkan dari cermin, jauhkan dari asap menara. Kalau ia menyala lagi tanpa kau minta, itu bukan keajaiban. Itu tanda. Seperti lentera di puncak menara dulu."

"Tanda apa?"

"Tanda bahwa sesuatu yang tertidur mulai memanggil nama yang sama." Ki Darmo melangkah ke kabut, dan suaranya tersisa paling tipis. "Dan yang terpanggil tidak pernah boleh menjawab sendirian."

Malam itu Elang tidak tidur. Ia meletakkan lentera di atas meja, memandanginya sampai cahaya keperakan itu reda sendiri sebelum fajar, seperti napas yang menipis. Di dasarnya, ukiran yang setengah terhapus itu terlihat sedikit lebih jelas daripada tadi malam.

Dua kata. Nama ibunya—dan di bawahnya, huruf-huruf kecil yang baru kali ini ia bisa baca:

"Menunggu di lantai yang tidak pernah naik."`,
  },
  {
    title: "Bab 2 — Undangan Bersegel Timah",
    text: `Surat itu datang tepat ketika lonceng pagi bergema, dibawa burung kondor berkeringat hitam yang tidak takut pada kabut. Amplopnya terbuat dari kulit ikan laut dalam, disegel timah, dan di segelnya tertekan lambang yang tidak pernah salah dikenali siapa pun di pesisir: menara bercabang tiga dalam lingkaran garam—Akademi Menara Kelabu.

Elang memutar-mutar segel itu. "Dikatakan menolak," ucapnya pada Ki Darmo. "Kok sekarang mau masuk?"

"Karena sekarang namamu punya dua arti." Ki Darmo menyeduh teh, tidak menoleh. "Semalam lentera itu menyala. Segel timah selalu tahu."

Surat itu pendek. Tulisannya rapi seperti diukir:

Kepada Elang, anak perempuan mendiang Seruni Lentera Pertama. Akademi membuka satu kursi luar biasa untuk calon penyulut angkatan ini. Ujian akan diadakan di Gerbang Kabut Asam, tiga hari dari sekarang, fajar. Bawa barang yang mewarisi nama itu. Jangan bawa harapan yang lebih besar dari satu genggam.

Di bawahnya, stempel basah: Nyala Briar, Ketua Sayap Penyulut.

"Nyala Briar," ulang Elang. "Ibu pernah menyebut nama itu. Sekali. Malam sebelum—" ia berhenti. Malam sebelum ibunya berangkat. "Dia teman ibu?"

"Dia saksi." Ki Darmo menyerahkan cangkir. "Dan saksi yang paling lama diam biasanya menyimpan cerita yang paling berat. Tiga hari itu lama. Kau tidak akan sempat pulang bolak-balik."

"Maka aku tidak akan pulang," kata Elang. "Aku berangkat besok subuh. Jalan kaki sampai Tanjung Kabut, lalu menumpang perahu pasir."

Ki Darmo menatapnya lama. Di mata penjaga tua itu ada perhitungan yang tidak ia ucapkan: jarak, kabut, nama ibu, dan anak yang tidak bisa lagi ditahan di menara yang sama dengan cerita yang tidak selesai. Akhirnya ia hanya mengangguk. "Kubilangkan jala di gudang. Ada uang di kaleng biskuit di belakang tumpukan jerami. Jangan sombong di jalan. Dan kalau ada orang bertanya siapa ibumu—"

"Sebut namanya penuh," potong Elang. "Ibu bilang nama tidak perlu disembunyikan kalau yang ditunggu itu benar."

Ki Darmo tertawa pendek, lalu tertawa lebih lama, dan tawanya berakhir seperti sesuatu yang lain. "Ibumu memang begitu bicara."

Packing itu singkat. Dua baju kanvas, pisau tali, botol perendam kabut buatan Ki Darmo, segenggam garam batu, dan lentera yang ia bungkus tiga lapis kain wol. Saat membungkusnya, di lantai tiga, cahaya keperakan itu menyala sekali—tipis, seperti usap tangan—lalu padam. Elang berdiri diam sejenak, lalu menyelesaikan simpulnya.

Pagi harinya, kabut turun lebih rendah dari biasanya, menyentuh atap-atap pasar seperti selimut yang dicuri dari tempat tidur. Ki Darmo mengantarnya sampai gerbang menara. Di sana, tanpa pengumuman, penjaga-penjaga tua sudah berdiri berbaris. Ada yang membawa garam. Ada yang membawa lilin. Semua mengangguk kepadanya seperti melantik.

"Kau bukan anak biasa yang pergi ke akademi," kata Ki Darmo. "Kau anak yang membawa pulang nama menara ini. Ingat itu kalau orang di sana meremehkanmu. Dan ingat juga—"

"Jangan menjawab panggilan sendirian," selesai Elang. "Aku ingat."

Ia melangkah keluar gerbang, dan kabut menutup jalan di belakangnya seperti air menutup bekas kapal.

Perjalanan dua hari itu ia lalui dengan jalan kaki menepi hutan pasir, tidur bergiliran, makan roti basi yang dibasahi teh. Di malam pertama, di bawah pohon cemara laut, lentera itu menyala lagi—kali ini lebih lama, dan cahayanya membentuk garis-garis kecil di pasir: bukan kata, bukan gambar. Pola. Pola yang sama dengan peta bintang yang terukir di dasar lentera.

Elang menghafalnya sampai bisa menggambar di udara dengan jarinya.

Di malam kedua, tak jauh dari Tanjung Kabut, ia mendengar langkah lain dalam kabut. Bukan binatang; langkah itu dua kaki, teratur, dan berhenti setiap kali Elang berhenti.

"Aku tahu kau di situ," seru Elang ke kabut. "Kalau kau dari akademi, jalan bareng. Kalau bukan—lentera ini terkenal panas."

Kabut tertawa. Tawanya muda, wanita, sedikit terengah. "Lentera itu tidak panas. Aku pernah melihatnya waktu kecil, dari perahu ayahku. Di puncak menara. Malam perang usai."

Elang berbalik. Di batas kabut berdiri gadis seusianya, rambut diikat tali kuning, membawa tongkat pengukur pasir yang lebih tinggi darinya. "Rani," kata gadis itu. "Ukuran resmi Gerbang Kabut Asam. Ayahku mengukur kabut untuk akademi tiga puluh tahun, dan aku mewarisi pekerjaan itu sebelum mewarisi kakiku yang kokoh."

"Elang." Ia mengangkat lentera sedikit. "Yang bawa cahaya malas."

"Kalau begitu kita cocok," kata Rani. "Aku yang bawa pengukur rajin."

Mereka berjalan berdampingan menuju titik yang berkilau jauh di depan—Gerbang Kabut Asam, dua pilar batu raksasa yang menelan dan memuntahkan kabut seperti napas. Dan di atas pilar, menggantung dalam sarung kain, lampu-lampu kecil sudah dinyalakan para penguji.

Tiga hari dari surat ternyata hari ini juga.

"Mereka memindahkan ujian," kata Rani cepat, membaca wajah Elang. "Kabar burung. Semua calon dipanggil lebih awal. Katanya... ada yang datang lebih dulu dari kita semua. Orang-orang berjubah abu. Mereka tidak mendaftar. Mereka hanya menunggu di luar gerbang, menghitung kita."

Elang meraba bungkusan lentera di punggungnya. "Yang datang lebih dulu biasanya bukan peserta."

"Tepat," kata Rani. "Dan fajar besok, gerbang ini akan membuka bukan untuk yang terkuat, tapi untuk yang cocok. Ujian Akademi tidak pernah mengukur kekuatan. Ia mengukur apa yang kau bawa ketika cahayamu sedang mati."

Di langit, kondor berkeringat hitam berteriak sekali, lalu terbang memutari pilar kiri—arah yang sama dengan kabut yang bergerak melawan angin.

Elang mempererat tali bungkusan. "Kalau begitu kita tidak boleh datang terakhir."

Rani tersenyum tipis dan mengangkat pengukurnya, membaca kabut yang menebal di depan gerbang. "Kita tidak akan," katanya. "Tapi kau harus tahu satu hal dulu, sebelum kita masuk ke sana. Ayahku mencatat sesuatu tiga puluh tahun lalu tentang malam perang usai. Malam saat lentera pertama menyala di puncak menara. Katanya, yang menyala bukan api dari dalam menara."

"Bukan?"

"Dari luar." Rani menunduk, mengukur garis kabut yang bergerak. "Dari arah laut. Seperti ada yang menjawab dari balik kabut—dan lentera menara hanya meneruskan jawabannya."

Angin berhenti sejenak. Kabut di depan gerbang berhenti bergerak, sesaat, seperti orang yang menahan napas.

Lalu lampu-lampu kecil di atas pilar itu, satu per satu, berubah warna: dari kuning hangat menjadi putih keperakan. Warna yang sama dengan cahaya di gudang lentera ibunya.

Elang memandanginya lama, dan di dalam kepalanya, kalimat Ki Darmo berulang seperti pasang: yang terpanggil tidak pernah boleh menjawab sendirian.

"Rani," katanya pelan. "Kau bilang ujian mengukur apa yang kita bawa saat cahaya kita mati. Kalau cahayaku tidak pernah benar-benar mati—kalau ia hanya menunggu—kira-kira mereka akan mengukur apa?"

Rani tidak menjawab langsung. Ia menarik nafas, mengukur sekali lagi, dan menuliskan angka di papan pasirnya—angka yang membuat alisnya naik sendiri.

"Kita akan tahu besok fajar," katanya. "Karena menurut pengukuranku... kabut di depan gerbang ini bukan kabut biasa. Ia bernafas dengan irama yang sama seperti lentera itu menyala semalam."

Dan jauh di dalam bungkusan di punggung Elang, tanpa disentuh siapa pun, lentera itu menyala lagi—putih keperakan, tenang, seperti orang yang mengangkat tangan di kelas untuk menjawab lebih dulu.`,
  },
  {
    title: "Bab 3 — Gerbang Kabut Asam",
    text: `Mereka tiba di gerbang saat langit masih warna abu dan abu. Di lapangan sebelum pilar, puluhan calon sudah berbaris: anak-anak dari keluarga penyulut, pewaris lentera keluarga, dua bersaudara pembawa lilin dari kepulauan timur. Semua membawa satu barang warisan, seperti tertulis di surat. Sebuah lonceng tanpa heard. Sepasang kacamata kabut. Sebuah palu kecil yang katanya pernah memukul lonceng menara utama.

Dan di barisan paling belakang, terpisah, berdiri enam orang berjubah abu. Tidak mendaftar. Tidak berbicara. Wajah mereka tertutup kerudung, dan kerudung itu tidak bergerak walau angin bergerak.

"Orde Abu," bisik Rani, tak perlu suara. "Jangan tatap. Pengukuranku bilang kabut di sekitar mereka lebih dingin empat derajat."

Petugas pendaftaran—seorang lelaki tua dengan tinta di jari—memanggil nama demi nama. Ketika tiba di giliran Elang, pena itu berhenti di udara.

"Elang. Anak siapa?"

"Anak Seruni," jawab Elang. "Lentera Pertama."

Lapangan yang bising itu mengecil jadi sunyi dalam dua detik. Beberapa calon menoleh. Salah seorang penguji di pilar menurunkan kacamata kabutnya. Dan dari barisan jubah abu, satu kerudung menoleh—perlahan, tepat ke arah Elang, meski wajahnya tak terlihat.

"Lentera Pertama tidak punya anak terdaftar," kata petugas itu, dan tangannya sudah mengarah ke tinta "ditolak".

"Kursi luar biasa," potong Rani, mengangkat suratnya sendiri. "Nyala Briar yang menandatangani. Kita dua-duanya masuk lewat kursi itu. Dan kalau perlu, aku bisa bacakan catatan ukur ayahku tentang siapa yang benar-benar menyala malam itu."

Lelaki tua itu memandangi mereka berdua, lalu surat, lalu segel timah yang—Entah sejak kapan—sudah tidak lagi tertutup rapi. Segel itu terbuka sendiri di tangan Elang, dan di dalamnya, di bawah undangan, ada satu baris tulisan tangan yang tidak ditulis oleh stempel:

Kalau mereka ragukan namamu, nyalakan lentera itu. — B.

Elang memandangi baris itu lama. Kemudian, tanpa pengumuman, ia meletakkan bungkusan di tanah, membuka tiga lapis kain wol, dan mengangkat lentera.

"Jangan—" bisik Rani.

"Suratnya yang menyuruh," jawab Elang. Dan ia membuka penutup kaca.

Cahaya keperakan menyala perlahan, tanpa gejolak, seperti kertas yang menyala dari dalam. Ia tidak menyilaukan. Ia justru membuat lapangan menjadi lebih tenang: suara angin turun, riuh calon surut, dan lampu-lampu kecil di pilar kiri dan kanan—satu per satu—menjadi putih keperakan, mengikuti.

Dan di barisan jubah abu, satu kerudung menyala samar dari dalam, seperti bara yang terbang masuk ke dalam kain. Orang itu mundur selangkah. Cuma satu. Tapi cukup untuk dihitung semua orang.

Cukup untuk membuat petugas tua menarik kembali jarinya dari kata "ditolak", menulis ulang nama Elang dengan huruf besar, dan membubuhkan cap yang tidak pernah dibubuhkan untuk kursi luar biasa: LENTERA.

"Lanjut," katanya, dan suaranya sedikit serak.

Setelah pendaftaran, para calon dipertemukan di depan pilar kiri. Nyala Briar akhirnya muncul—perempuan tinggi berjubah biru gelap, rambut seputih garam, membawa tongkat penyulut yang ujungnya bukan api melainkan kaca cekung. Suaranya tidak keras, tapi semua orang mendengar.

"Aturan ujian satu kalimat," katanya. "Masuki gerbang, keluar di sisi lain menara, dan jangan biarkan kabut memberimu nama baru."

Bisik-bisik riuh. Memberi nama baru? Kabut Asam terkenal menyapu ingatan sekaligus memberi kebingungan: orang yang terlalu lama di dalamnya keluar dengan menyebut dirinya dengan nama orang lain, dan selamanya begitu.

"Kabut bekerja lewat keinginan," lanjut Nyala Briar, memandangi barisan, dan di akhir barisannya pandangannya berhenti di Elang sedetik lebih lama. "Ia menawarkan apa yang paling kau inginkan, dengan suara yang paling kau kenal. Calon yang gagal bukan yang lemah. Calon yang gagal adalah yang menjawab."

Ia mengangkat tongkatnya. Pilar-pilar berderak; gerbang mulai menyala biru redup di retakan-retakannya.

"Masuk dalam kelompok tiga. Bawa warisanmu. Dan ingat: di dalam kabut, kalau kau mendengar ibumu memanggil—"

Ia berhenti. Lapangan menunggu.

"—itu bukan ibumu."

Kelompok dibentuk menurut urutan pendaftaran. Elang mendapat Rani, seorang lelaki gemuk bernama Bandel yang mewarisi palu kecil itu, dan seorang anak kepulauan pendiam bernama Serih yang membawa cangkang kerang hitam yang katanya bisa menampung suara.

Mereka melangkah masuk bersama-sama, tangan di bahu satu sama lain seperti diajari para penjaga jembatan.

Di dalam, dunia menjadi putih. Tidak ada jarak. Tidak ada suara langkah. Kabut Asam terasa seperti masuk ke dalam lagu yang berhenti di tengah kalimat.

Lalu, dari kejauhan, samar, hangat, familiar:

"Elang. Anakku. Ayah sakit. Pulanglah."

Suara ibunya.

Elang menggigit bibirnya sampai hamper berdarah, menggenggam lentera mati di genggamannya, dan mengulang kalimat yang ia pegang sejak gudang: yang terpanggil tidak pernah boleh menjawab sendirian.

"Rani," serunya ke putih yang tak berwajah. "Rani! Jangan lepas tanganku!"

Jari-jari yang dingin itu merangkak mencarinya. Dan di suatu tempat di kabut, suara kedua mulai bicara—kali ini memakai suara Rani yang kecil dan cepat, mengajak mendekat ke arah yang berbeda.

Kabut Asam baru saja mulai bekerja.`,
  },
  {
    title: "Bab 4 — Ruang Kelas Lantai Bawah Tanah",
    text: `Mereka keluar dari gerbang saat matahari sudah condong barat, dan yang mengejutkan bukan lamanya waktu di dalam, melainkan apa yang mereka bawa keluar: tiga luka kecil berbentuk huruf di punggung tangan Elang, huruf E; huruf R di tangan Rani; huruf B di tangan Bandel.

"Kabut menandai yang lolos," kata Nyala Briar saat memeriksa. "Huruf pertama namamu. Kalau kau keluar tanpa tanda, berarti kabut sudah menuliskan namamu di suatu tempat lain, dan itu... masalah yang jauh lebih besar."

Dari enam puluh calon yang masuk, empat puluh satu keluar dengan tanda. Sisanya dua puluh sembilan tidak keluar sampai matahari tenggelam, dan gerbang ditutup dengan upacara garam yang sunyi.

Malam itu semua yang lolos dinaikkan ke Akademi—bukan lewat gerbang besar, melainkan lewat lift kerang raksasa di sisi tebing yang menaikkan mereka menembus awan, selama seperempat jam, sampai fondasi Akademi Menara Kelabu muncul dari langit: sebuah kompleks menara bercabang tiga yang batu-batunya, entah bagaimana, adalah warna kabut.

"Kenapa menara di atas awan?" tanya Bandel, terbuka mulut.

"Supaya kabut tidak bisa naik lagi," kata Nyala Briar datar. "Dulu ia pernah naik. Sekarang kita yang duduk di jalurnya."

Asrama dibagi menurut tanda kabut. Huruf yang sama ditumpuk di lantai yang sama. Elang (E) mendapat lantai sembilan bersama tujuh anak lain yang namanya juga diawali E—Emran, Esti, Eja, dan empat lagi yang wajahnya masih pucat oleh kabut. Rani (R) di lantai sebelas. Bandel (B) di lantai tiga.

"Kalau butuh aku, turun dua, naik dua," kata Rani sebelum pintu mereka terpisah. "Jangan jalan sendirian malam-malam. Kabut di sini tidak asam, tapi ia punya ingatan."

Kamar Elang kecil: satu ranjang, satu meja, satu jendela yang menghadap awan, dan satu cermin kecil di pintu lemari—yang malam itu ia tutup dengan handuk tanpa pikir panjang. Jauhkan dari cermin, kata Ki Darmo.

Ia meletakkan lentera di meja. Sepanjang perjalanan, lentera itu tidak menyala lagi. Namun di dalam kaca, di dasar, pola bintang yang dulu ia hafal di pantai kini ada satu garis yang menyala redup—garis yang mengarah ke bawah. Bukan ke langit.

"Ke bawah?" bisiknya.

Jawabannya datang pagi harinya, lewat jadwal kelas yang digantung di masing-masing lantai. Angkatan luar biasa mendapat jadwal terpisah, ditulis tangan oleh Nyala Briar sendiri:

Pagi: Kelas Pengencang Kabut (Menara Utama, lantai dua).
Siang: Teori Nama dan Segel (lantai enam).
Malam: Praktik bersama Sayap Penyulut (puncak, hanya yang dipanggil).

Dan di bawah jadwal itu, satu baris kecil, ditambahkan dengan tinta berbeda:

Kepada Elang: datang ke arsip lantai satu setelah kelas pagi. Jangan lewat lift kerang. Naik tangga biasa. Bawa lentera. — B.

Kelas pagi pertama diisi tujuh belas murid dari berbagai huruf. Pengajarnya, Guru Seruni—bukan saudara ibunya, kebetulan nama—adalah perempuan kecil berusia yang berbicara dengan nada guru menari.

"Pengencang kabut," katanya, "bukan mantra. Ia pekerjaan. Kabut adalah ingatan yang tidak selesai dibicarakan. Ia melayang karena belum selesai. Pengencang membuatnya selesai—dengan caranya: satu kalimat yang benar, diucapkan dengan napas yang benar, pada waktunya yang benar."

Ia membagi murid menjadi dua baris dan memberi tugas sederhana: tiap murid mengucapkan satu kalimat tentang rahasia keluarga mereka, dan melihat apakah kabut di dalam wadah kaca di tengah meja bergerak mendekat atau menjauh.

Anak demi anak maju. Ada yang kalimatnya membuat kabut berputar marah. Ada yang membuat kabut tidur. Ketika tiba giliran Elang, ia berdiri, membuka mulut—

—dan lentera di tasnya, tanpa disentuh, menyala.

Panas. Untuk pertama kalinya, cahaya keperakan itu panas. Kabut di wadah kaca berhenti bergerak sama sekali, lalu, perlahan, seperti orang yang takut, ia menyingkir ke sudut wadah.

Kelas itu hening. Guru Seruni memandangi lentera, lalu Elang, lalu lentera lagi, dan wajah tua itu memutih.

"Itu lentera tipe apa?" tanyanya akhirnya, suara berubah.

"Bukan tipe," jawab Elang pelan. "Warisan."

"Warisan siapa?"

"Seruni. Lentera Pertama."

Perempuan kecil itu duduk. Murid-murid lain saling pandang. Dan di luar jendela, di tengah langit cerah pagi di atas awan, kabut tipis—kabut yang seharusnya tidak bisa naik setinggi ini—menempel di kaca jendela selama dua detik, membentuk pola yang sama dengan garis bintang di dasar lentera, lalu tersapu angin.

Setelah kelas, di koridor, seseorang menunggu Elang: anak laki-laki tinggi dengan seragam Orde Abu yang sengaja dibiarkan terlihat, wajahnya tersenyum seperti salesman.

"Daru," katanya, memperkenalkan diri. "Daru Abu Kedua. Ayahku bilang, akademi sedang mencari barang warisan yang bisa menyalakan apa saja. Kalau kau mau, kami bisa memberi harga yang... wajar. Untuk lentera itu. Dan untuk ceritanya."

Elang berjalan terus tanpa menjawab, tapi telinganya menangkap kalimat terakhir Daru, yang diucapkan pelan seperti hadiah:

"Orde Abu sudah lama mencarinya. Malam perang usai itu, yang padam bukan cuma api menara, tahu. Yang padam adalah pelarian mereka. Dan pelarian itu membawa sesuatu."

Di ujung koridor, di bawah tangga biasa yang katanya harus ia naiki setelah kelas siang, pintu arsip menunggu—dan di sisi bawah pintu, dari celah, keluar sedikit cahaya keperakan.

Cahaya yang sama. Yang dari bawah.`,
  },
  {
    title: "Bab 5 — Guru yang Menunggu di Arsip",
    text: `Tangga biasa itu sempit, berumur, dan bergelombang—batu-batunya menekuk seperti dihangatkan berkali-kali. Elang menaikinya perlahan, lentera di tangan sudah menyala penuh sejak anak tangga ketiga, memandu ia ke kiri, ke kanan, ke kiri lagi—pola yang sama dengan pola bintang di dasar lentera, seperti kunci yang mengajari tangan cara memutar.

Pintu arsip lantai satu ternyata bukan pintu. Ia adalah dinding penuh rak—dan rak itu bergeser saat Elang berdiri tepat di depannya dengan lentera menyala.

Di baliknya: arsip yang jauh lebih besar dari bangunan di atasnya. Lorong-lorong rak tanpa ujung, memanjang ke arah yang tidak masuk akal, dan udara di dalamnya—bersih, hangat, bau kertas dan garam. Di ujung lorong pertama, di bawah lampu keperakan yang sama dengan cahaya lenteranya, seorang perempuan duduk di kursi kayu, membaca.

Rambut seputih garam. Jubah biru gelap.

"Nyala Briar," kata Elang.

"Kau telat empat menit." Perempuan itu tidak mengangkat wajah. "Tangga biasa memang lebih panjang. Itu sengaja. Kabut tidak suka naik tangga."

Elang mendekat. Meja Briar penuh kertas—dan di atasnya, terbuka, sebuah buku besar bertuliskan di sampulnya: LEDGER LENTERA, JILID SATU. Di halaman itu ada daftar nama, dan banyak namanya dicoret, dan beberapa namanya ditulis ulang dengan tinta biru.

"Kau menyuruhku bawa lentera."

"Bukan aku yang menyuruh." Briar akhirnya mengangkat wajah. Matanya kelabu seperti batu menara. "Lentera itu yang menyuruh. Aku hanya menuliskan suratnya. Segel timah itu tidak pernah salah pilih alamat."

Ia menutup ledger, menepuk kursi di seberangnya. "Duduk. Kau ingin tahu ibumu. Aku ingin tahu kenapa lentera itu memilih anaknya sekarang, setelah tiga tahun diam. Dan jawaban kita kemungkinan ada di tempat yang sama: di bawah menara ini, di lorong yang tidak pernah naik."

"Ibu pernah di sini?" Elang duduk.

"Ibumu tidak pernah naik apa pun." Briar tersenyum tipis, pertama kalinya. "Ibumu turun. Itu beda kita semua dan dia. Kami, para penyulut, belajar menyalakan dari dalam. Dia belajar menyalakan dari luar—dari balik kabut. Itu ilmu yang tidak kami ajarkan, karena kami tidak bisa. Dan itu ilmu yang membuatnya pergi malam perang usai, dan tidak kembali."

Elang menggenggam lentera. "Kau katakan dulu—di lapangan—yang di luar gerbang itu orang-orang Orde Abu. Kau mengenal mereka?"

"Kenal?" Briar terkekeh, tanpa banyak suara. "Aku pernah jadi mereka. Tiga tahun. Sebelum akhirnya aku memotong jubah abuku dan melarikan diri membawa setengah ledger ini."

Ia mengetuk meja. "Dengar baik-baik, anak Lentera, karena aku hanya mengatakan ini sekali. Orde Abu bukan kultus yang menyembah kegelapan—mereka lebih membosankan dari itu: mereka adalah penagih. Dulu, sebelum perang, akademi meminjam kekuatan dari balik kabut. Kabut meminta bayar. Bayarnya nama: setiap kali kami menyalakan sesuatu dengan ilmu itu, satu nama dituliskan di ledger mereka, dan pemilik nama itu perlahan jadi kabut sendiri. Perang usai bukan karena kita menang. Perang usai karena seseorang membakar ledger mereka, dan tanpa ledger, mereka tidak bisa menagih."

"Bakar siapa?"

"Tidak tahu. Yang tahu sudah tidak bicara." Briar menatap lentera. "Tapi ada satu hal yang semua orang pernah dengar dan tidak ada yang percaya: pelarian itu membawa ledger asli. Ledger yang tidak bisa dibakar. Dan ia membawanya turun—ke tempat yang tidak pernah naik."

Elang merasakan bulu kuduknya berdiri, karena dua kalimat itu—dari surat di dasar lentera, dari mulut Briar—kini berdiri bersebelahan seperti dua keping puzzle.

"Menunggu di lantai yang tidak pernah naik," ucapnya pelan.

"Dan di akademi ini," kata Briar, "ada satu tempat yang tidak pernah naik apa-apa. Lorong bawah tanah. Tempat lift kerang bersandar. Tempat arsip yang tidak boleh dibaca. Kau tahu kenapa menara dibangun di atas awan?"

"Supaya kabut tidak bisa naik."

"Setengah benar. Supaya kabut tidak bisa naik—dan supaya apa yang di bawah tidak bisa turun." Briar bangkit, menyalakan lampu keperakan kedua dari cahaya lentera Elang. "Kabut itu bukan cuaca, anak Lentera. Ia korrespondensi. Seseorang di bawah sana masih menulis surat, dan langit masih membalas. Kau tahu cara membaca pola bintang di dasar lentera itu?"

"Ku hafal."

"Bagus. Karena tiga malam terakhir, pola itu berubah." Briar membawa ia ke lorong ketiga, ke sebuah meja penuh kertas burung kondor—peta langit malam demi malam, digambar tangan. "Lihat garisnya. Ia bukan lagi peta bintang. Ia tulisan. Dan tulisan itu mengulang dua kata yang sama, malam demi malam, lebih terang setiap malam."

Elang membacanya. Membaca lagi. Kali ketiga, ia mengucapkannya dengan suara yang tidak sepenuhnya miliknya:

"Kembalikan. Ibu."

Di lorong itu, jauh di ujung, tanpa angin, satu rak buku bergeser sendiri satu inci—dan dari baliknya, hangat, sabar, familiar, suara ibunya terdengar setengah detik sebelum cahaya lentera memutih dan memuntahkannya keluar:

"Elang. Anakku. Kau sudah besar sekali."

Lalu sunyi. Briar meraih tongkatnya, dan cahaya kedua menyala keperakan, memantapkan ruangan.

"Kabut di sini?" suara Elang serak.

"Itu bukan kabut." Briar memandanginya dengan mata kelabu yang untuk pertama kalinya terlihat takut. "Itu akademi ini, menyala dari luar—seperti yang dilakukan ibumu dulu. Dan anak Lentera... ia baru menyala karena kau membawa lentera itu masuk. Jadi sekarang dengarkan aku, karena kita tidak punya banyak waktu sebelum Orde Abu mencium cahaya dari tebing:

Kau punya dua pilihan malam ini. Naik ke puncak bersama Sayap Penyulut seperti jadwal—atau turun bersamaku ke lorong yang tidak pernah naik, dan menjadi anak pertama yang menemukan apa yang ibumu tinggalkan di sana."

Briar mengulurkan tangan. "Tapi kau tidak boleh memilih keduanya. Dan kau tidak boleh memilih sendirian."`,
  },
  {
    title: "Bab 6 — Lorong yang Tidak Pernah Naik",
    text: `Malam itu, di puncak menara, Sayap Penyulut melakukan latihan penyalaan biasa: dua puluh murid berdiri melingkar, tiap orang memegang kaca cekung, dan cahaya dipindah dari satu kaca ke kaca berikutnya seperti air dipindah dengan ember. Elang berdiri di lingkar itu, tapi kacanya kosong. Lentera di tasnya bersikeras tetap mati—dan tidak sekali pun menolong, seolah memutuskan bahwa pelajaran penyalaan dari dalam bukan pelajarannya.

"Kau tidak fokus," kata Nyala Briar ketika lingkar latihan bubar. Bukan tengahan; pernyataan. "Kaca cekung membaca niat. Niatmu malam ini tidak di puncak."

"Aku ingin turun," jawab Elang. Bukan berkelit; karena dengan Briar, ia memilih jujur—orang yang pernah memotong jubah abunya sendiri pantas menerima kejujuran yang sama.

Briar memandanginya lama, lalu menghela napas seperti orang yang sudah tahu jawaban jauh sebelum bertanya. "Aku tahu. Makanya aku menyiapkan tiga hal." Ia mengeluarkannya satu per satu dari saku jubah: seutas tali berwarna garam, sebuah kancing kuningan kecil berukir menara, dan satu lembar peta yang digambar di atas kulit ikan.

"Tali garam: sepanjang seratus lantai menara, ia tidak pernah putus meski dipotong—ia hanya bercabang. Kancing kuningan: kunci pintu mana pun di menara ini, asal pintunya pernah didengar bunyi langkah. Dan peta ini..." Ia menggulungnya lagi. "Peta ini bukan peta ruangan. Ia peta suara. Setiap goresan adalah tempat di mana seseorang pernah bicara di menara ini, tiga puluh tahun terakhir. Kabut menyimpan suara, anak Lentera. Dan di lorong bawah, suara-suara itu tidak pernah padam."

"Maka kita turun malam ini."

"Kita turun malam ini," setuju Briar. "Tapi bukan lewat lift kerang—Orde Abu mengawalinya sejak kemarin; Daru melapor tentang lenteramu lebih cepat dari perkiraanku. Kita lewat sumur timah di lantai sembilan belas: bolong menara lama yang dulu dipakai menurunkan batu. Sepuluh lantai ke bawah, lalu lorong horizontal. Tempat yang tidak pernah naik."

Mereka turun saat lonceng tengah malam, dengan tali garam diikat di pinggang satu sama lain. Sumur timah itu sempit, licin, bau logam, dan gelapnya bukan gelap biasa—gelap yang menempel. Di kegelapan itu, lentera akhirnya menyala; putih keperakan, lembut, dan bukan menembus kegelapan, tapi menggantinya seperti rasa bersalah diganti pengertian.

Sepuluh lantai ke bawah, kaki mereka menyentuh batu yang tidak pernah diinjak siapa pun selama tiga dekade. Lorong horizontal itu lebar, melengkung, dan dindingnya penuh goresan tangan kecil—puluhan, ratusan, semuanya pada ketinggian yang sama, semuanya mengarah ke satu arah.

"Anak-anak," bisik Briar, menyentuh satu goresan. "Ini jejak pengukur kabut. Rani—ayahmu mengukur di sini. Sebelum kau lahir."

Dan di ujung lorong, berdiri sebuah pintu. Bukan pintu besar; pintu kamar biasa, kayu tua, dengan kancing kuningan yang identik dengan kancing milik Briar.

Pintu itu sudah terbuka sedikit. Sedekade lama, sepertinya.

Dan dari celahnya, keluar cahaya keperakan—bukan milik lentera Elang. Cahaya itu lama, tenang, dan bau minyak ikan bawa gudang lama.

Ibu ada di dalam.

Briar mencengkeram pundak Elang sebelum langkahnya melangkah. "Ingat aturan ujian. Kalau kau mendengar ibumu memanggil—"

"Ia bukan ibumu," selesai Elang. "Aku ingat. Tapi Ki Darmo juga bilang... bahwa lentera itu tanda. Dan tanda ini bukan panggilan, Nyala. Panggilan minta jawab. Tanda hanya meminta kau mendekat."

Ia melangkah ke depan. Tali garamnya tegang, menahan, lalu—secara ajaib, sabar—melonggarkan diri secukupnya, seperti tali yang mengerti.

Di dalam kamar kecil di bawah tanah menara itu, ada: satu ranjang lipat, satu meja, satu kursi, satu lilin setengah leleh, tumpukan kertas setinggi lutut, dan di dinding, ditulis dengan tinta yang memudah: daftar nama. Ratusan nama. Dan satu kolom di sampingnya, diisi dengan satu kata yang sama untuk setiap nama:

Menunggu.

Di meja, tergolek sebuah lentera. Lentera pertama. Seruni, Lentera Pertama—masih menyala, putih keperakan, dan di dasarnya, ukiran nama yang sama dengan di lentera kedua milik Elang.

Dan di kursi, tidak menyentuh lentera, tidak menyentuh daftar, duduk seorang perempuan dewasa dengan pakaian perjalanan tiga dekade lalu, tersenyum seperti orang yang menunggu anaknya pulang sekolah.

"Kau berdua bagus sekali menjaga jarak," katanya, suaranya persis suara dari kabut, persis suara dari ingatan. "Tapi sayangnya, kalian bukan yang pertama mencoba menemukan ruangan ini. Dan mereka yang pertama—mereka menemukan sesuatu yang lain. Lihat daftarnya, anak Lentera. Ada nama kalian di sana? Kalau ada, berlari. Kalau tidak ada... maka duduklah, dan kita bicara, karena berarti kalian diundang."

Elang melangkah ke daftar itu, jantungnya berdegup seperti palu Bandel. Jarinya menyusuri nama demi nama—nama-nama yang dicoret coret—sampai akhir daftar.

Tidak ada. Elang tidak ada di daftar. Rani tidak di daftar. Bahkan nama Nyala Briar sudah dicoret dengan tinta biru—dicoret, bukan coretan kebencian; dicoret seperti orang mencoret tugas yang selesai.

"Berarti kita diundang," kata Elang, dan suaranya tidak bergetar, dan itu bukan karena berani, tapi karena di ruangan itu, untuk pertama kalinya sejak ibunya pergi, ia merasa tidak sedang dicari. Ia sedang... diharapkan.

Perempuan itu bersandar. "Maka mari bicara. Tentang malam perang usai. Tentang siapa yang membakar ledger Orde Abu. Dan tentang siapa yang sebenarnya menuliskan nama-nama itu—karena anakku... itu bukan Orde Abu. Dan bukan juga orang yang kalian kira."

Di luar pintu, jauh di atas, samar seperti gema dari dunia lain, lonceng tengah malam bergema kedua—jam yang tidak pernah dibunyikan dua kali.

Dan di meja, lilin yang setengah leleh itu, tanpa sumber api, menyala. Tiga tahun berminggu-minggu, bermalam-malam menunggu, akhirnya ada yang datang.

"Beri aku satu jam," kata perempuan itu. "Dan satu pertanyaan. Satu pertanyaan saja—karena di ruangan ini, pertanyaan lebih mahal daripada jawaban." Ia memandangi Elang, lalu Briar, lalu kembali ke Elang.

"Pilih pertanyaanmu dengan hati-hati, anak Lentera. Karena jawabannya akan mengubah apa yang kau warisi."`,
  },
  {
    title: "Bab 7 — Satu Pertanyaan",
    text: `Satu pertanyaan.

Elang duduk di lantai, karena kursi hanya satu dan ia tidak ingin memindahkannya—kursi itu milik orang yang menunggu, dan orang yang menunggu tidak boleh disingkirkan dari kursinya sendiri. Rani, yang ternyata menyusul turun lewat sumur timah dengan Bandel setelah menemukan peta suara yang tertinggal sengaja di kelas teori, berjongkok di dekat pintu. Briar berdiri. Empat orang. Satu ruangan. Tiga puluh tahun cerita, dan hanya satu pertanyaan yang boleh dibawa keluar.

"Sebelum kau memilih," kata perempuan itu, "kuberi tiga klausul. Pertama: kau boleh bertanya tentang apa pun, tapi jawabanku hanya akan benar untuk hari ini. Kalau kau bertanya tentang besok, jawabanku adalah kebohongan yang paling sopan yang aku bisa buat. Kedua: kau tidak boleh bertanya siapa aku—karena aku sudah kehilangan hak untuk menjawabnya dengan nama asliku. Ketiga... dan ini yang penting..."

Ia menurunkan suaranya.

"Kau tidak boleh bertanya apakah aku ibumu. Karena kalau kau bertanya itu, maka inilah yang harus kau dengar dariku, dan itu akan merusak segalanya: aku tidak tahu. Aku tidak tahu apakah aku masih ibumu, atau sudah menjadi sesuatu yang hanya ingat bagaimana jadinya seorang ibu. Tiga puluh tahun di ruangan dengan daftar nama membuat perbedaan itu kabur, anakku. Dan jawaban yang kabur lebih kejam daripada kebohongan yang tegas."

Sunyi. Di lorong, air menetes dengan irama yang terlalu teratur untuk tetesan biasa.

Rani mendekap. Bandel menunduk. Briar memejamkan mata—ia pernah duduk di kursi itu dulu, tiga dekade lalu, dan memilih pertanyaannya sendiri. Ia tahu rasanya.

Elang memejamkan mata juga, dan membiarkan kepalanya kosong selama sepuluh napas, seperti yang diajarkan Ki Darmo sebelum memasang jala: jangan menarik terlalu cepat, ikan yang benar akan mendekat sendiri.

Kemudian ia membuka matanya.

"Ibu tidak akan menjawab siapa yang membakar ledger Orde Abu," katanya. "Itu pertanyaan Briar, bukan aku."

Briar menoleh, terluka sedikit—lalu mengerti, dan menunduk.

"Dan aku tidak akan bertanya bagaimana cara membuka lorong, atau menaklukkan kabut, atau memenangkan perang berikutnya. Itu pertanyaan Nyala Briar kedua." Elang menatap perempuan di kursi itu. "Dan aku tidak akan bertanya kenapa kau pergi, atau kenapa kau tinggal, atau kenapa kau tidak menulis surat biasa seperti ibu-ibu lainnya. Karena itu pertanyaan anak yang dulu dititipkan di gudang, dan aku sudah tumbuh dari anak itu. Ki Darmo mengasuhku baik. Menara mengasuhku baik."

Perempuan itu tersenyum. Matinya basah, tapi tangannya tetap tenang di pangkuan.

"Maka pertanyaanku satu, dan kau tahu ini akan sulit":

Elang mengulurkan lentera yang sudah mati, meletakkannya di lantai, di samping lentera pertama yang masih menyala. Dua lentera, berdampingan. Yang tua menyala. Yang muda mati. Dan di dasar keduanya, ukiran nama yang sama, hanya terpisah dua angka yang kini saling menghadap: 1 dan 2.

"Kau menuliskan di dasar lentera yang kuinggik malam itu: menunggu di lantai yang tidak pernah naik. Ibu— orang yang menunggu di ruangan ini— kau menuliskannya untukku, atau untuk dirimu sendiri?"

Ruangan itu terdiam lebih lama dari semua keheningan yang pernah didengar siapa pun di dalamnya.

Rani berhenti bernapas. Bandel melupakan palunya. Bahkan cahaya lentera pertama meredup, sedikit, seperti mendongak untuk mendengar.

Dan perempuan itu—wajahnya yang tiga dekade tidak berubah—akhirnya berubah. Bukan tua. Bukan muda. Hanya... jujur, untuk pertama kalinya, di hadapan seseorang.

"Untuk diriku sendiri," jawabnya. "Tiga puluh tahun aku menunggu di lantai yang tidak pernah naik, dan aku menulisnya di sana—di tempat yang paling sering kau pegang—karena aku pengecut yang lebih berani menulis pada benda daripada pada anaknya. Maafkan aku untuk itu. Dan terima kasih, karena kau tidak bertanya soal itu... tapi kini kau tahu."

Ia bangkit—pertama kalinya dalam tiga dekade mungkin—dan berlutut di depan Elang, setinggi mata.

"Sekarang dengarkan jawaban kedua yang tidak kau tanyakan, karena kau berhak mendapatkannya. Aku tidak tahu apakah aku masih ibumu. Tapi aku tahu satu hal yang tidak berubah oleh tiga puluh tahun daftar nama: ibu tidak menunggu anaknya pulang untuk dijadikan alasan. Ibu menunggu anaknya pulang agar bisa memberitahu satu hal yang belum sempat disampaikan."

Ia menggenggam kedua tangan Elang—tangan yang dingin, dingin seperti logam lentera dulu, tapi genggamannya nyata.

"Kau tidak sedang menyelesaikan peranku, Elang. Kau sedang menghentikannya. Lentera Pertama yang kubawa turun ke sini bukan senjata dan bukan kunci. Ia penghenti. Ia adalah alasan kenapa ledger Orde Abu tidak bisa lagi menagih nama siapa pun: karena selama lentera ini menyala di ruangan ini, semua nama di daftar mereka menjadi milik kita. Aku menuliskan nama mereka satu per satu di daftarku selama tiga puluh tahun. Mereka pikir mereka menagih. Mereka sebenarnya ditagih balik. Dan mereka baru menyadarinya semalam, ketika lentera kedua menyala di gudang."

Ia menoleh ke Briar. "Nyala. Kau sudah membaca ledger setengah yang kau bawa keluar. Katakan pada mereka apa yang kau temukan di halaman terakhir."

Briar terdiam lama. Lalu, dengan suara yang tidak ia pakai di kelas mana pun:

"Di halaman terakhir ledger yang kubawa keluar... ada nama Elang. Ditulis tiga puluh tahun lalu. Tapi di kolom statusnya, bukan ditunggu, bukan diminta. Ditulis: DIKECUALIKAN. Dan di bawahnya, tulisan tangan yang sama dengan di dasar lentera: Menunggu di lantai yang tidak pernah naik."

"Artinya?" tanya Rani, tak sanggup menahan diri.

"Artinya," kata perempuan itu, berdiri, dan untuk pertama kalinya kamar bawah tanah itu terasa sempit oleh kehadirannya, "Orde Abu akan datang ke sini bukan untuk menagih anak itu. Mereka datang untuk menghapus pengecualian satu-satunya—karena selama ada satu nama yang dikecualikan, daftar mereka tidak pernah lengkap, dan tagihan mereka tidak pernah final."

Ia mengangkat lentera pertama dari meja, dan menyerahkannya kepada Elang, dengan dua tangan, seperti menyerahkan jabatan.

"Satu pertanyaanmu sudah kau bayar dengan tiga tahun menunggu dan sepuluh tahun besar tanpa ibu. Sekarang pulanglah ke atas, keluar dari menara ini, dan buat mereka datang ke ruangan yang salah. Aku akan tetap di sini, menuliskan nama mereka sampai daftarku selesai. Kau—"

Ia tersenyum, dan kali ini senyumnya adalah senyum di gerbang pasar yang dulu, yang menuntun menyeberangi jembatan.

"—kau jadilah lentera yang tidak pernah menyala di tempat yang mereka duga."`,
  },
  {
    title: "Bab 8 — Yang Menyala di Tempat yang Salah",
    text: `Mereka naik kembali lewat sumur timah saat lonceng satu pagi, dan di lantai sembilan belas, tali garam Elang terpotong sendiri—bersih, lurus, seperti dipotong pisau—menyisakan tiga kepingan di kepalan Rani.

"Tali itu tidak pernah putus," kata Briar, memandangi kepingan itu. "Ia bercabang. Berarti... ada yang membuat cabangnya. Ada jalan lain yang dibukanya."

"Untuk siapa?" tanya Bandel.

"Untuk kita," jawab Elang. Ia menyimpan kepingan tali itu di saku. "Coba pikir. Ruangan itu tidak menahan kita. Daftar tidak memuat nama kita. Ibu— orang di ruangan itu—menyerahkan lentera pertama dengan sukarela. Terlalu lancar semua. Seolah kita baru saja dipinjamkan jalan keluar oleh seseorang yang ingin kita sampai ke suatu tempat, cepat."

"Atau oleh sesuatu," gumam Rani, dan tak seorang pun menyangkalnya.

Pagi itu, ketika lift kerang menurunkan mereka dari Akademi untuk "cuti persiapan" tiga hari yang diumumkan mendadak, Gerbang Kabut Asam sudah berbeda. Lampu-lampu kecil di atas pilar yang dulu menyala putih keperakan kini menyala abu redup. Di lapangan, enam jubah abu berdiri di tempat yang sama seperti dulu—tapi kali ini mereka tidak menunggu. Mereka menghitung.

Dan dari arah tebing, samar, terdengar suara gong Orde Abu: tiga ketukan panjang, dua pendek. Kode yang bahkan anak-anak pesisir tahu artinya—panggilan sidang.

"Mereka tahu," bisik Rani. "Mereka tahu kita turun."

"Bukan kita." Elang memandangi gerbang yang perlahan dikelilingi jubah-jubah abu itu. "Mereka datang untuk menghapus pengecualian. Ibu bilang begitu. Dan pengecualian itu namaku. Tapi mereka tidak bisa menagihku langsung—ledger mereka terbakar; tagihan mereka tergantung pada daftar yang selama ini ditulis ulang oleh orang di bawah sana. Maka langkah pertama mereka bukan ke ruangan bawah tanah."

Elang menoleh ke Rani. "Mereka akan memaksa pihak akademi menyerahkan ledger setengah yang Briar bawa keluar tiga puluh tahun lalu. Satu-satunya salinan luar yang memuat nama-nama mereka dan status pengecualianku. Tanpa salinan itu, klaim mereka terhadap akademi menjadi tidak berdasar."

"Ledger itu ada di arsip," kata Rani cepat. "Bilik Briar."

"Tepat. Dan mereka sudah mengirim pengirraannya." Elang menoleh ke arah jalan setapak di balik gerbang, di mana sosok tinggi dengan seragam Orde Abu yang sengaja dipajang sedang berdiri santai, menunggu—Daru Abu Kedua, dengan senyum salesman yang sama.

"Elang!" sapa Daru dari jauh, ramah seperti tetangga yang meminjam garam. "Aku dengar kau turun ke bawah semalam. Bagus. Berarti kau sudah melihat daftarnya sendiri. Maka kau tahu—ini bukan ancaman, ini penawaran. Serahkan ledger setengah itu, dan Orde Abu mencoret namamu dari semua daftar. Kau bebas. Akademi aman. Semua pulang."

"Kalau tidak?"

"Kalau tidak," Daru membuka kedua tangannya, tetap ramah, "besok fajar, Gerbang Kabut Asam akan dibuka penuh. Semua kabut yang selama ini ditahan oleh segel-segel pilar akan turun ke pesisir. Ke pasar. Ke menara-menara kecil tempat keluarga para calon tinggal. Kabut Asam tidak membunuh, kau tahu. Ia hanya... menukar nama. Dan orang-orang yang kembali dari kabut dengan nama baru adalah orang yang paling mudah diminta bayarannya."

Jantung Elang jatuh. Menara. Ki Darmo. Para penjaga tua yang mengantarnya dengan garam dan lilin di tangan.

"Berapa waktu yang kalian beri?"

"Sebelum fajar." Daru menunduk sedikit, hormat yang hampir tulus. "Ledger, atau kabut. Pilihanmu, anak pengecualian."

Mereka membicarakannya di bilik Briar lantai arsip, pintu digeser rapat, lampu keperakan diredupkan. Briar meletakkan ledger setengah itu di meja—satu-satunya salinan luar.

"Tiga pilihan," kata Briar. "Satu: serahkan ledger. Orde Abu mencoret namamu, akademi kehilangan satu-satunya bukti bahwa pengecualian itu ada, dan selamanya setelah itu mereka menagih siapa saja yang mereka suka. Dua: tolak, kabut turun ke pesisir, dan semua wajah yang kau kenal di menara pulang dengan nama baru. Tiga—"

Ia berhenti. Memandangi Elang lama. Lalu lentera di meja Elang, yang sejak tiba di bilik ini menolak menyala, tiba-tiba menyala sendiri—putih keperakan, tenang—seperti murid yang mengangkat tangan.

"Tiga," kata Elang, mengerti. "Kita serahkan ledger. Tapi bukan ledger yang mereka kira."

Bilik itu sunyi. Lalu Briar tertawa—pertama kali sejak Elang mengenalnya, dan tawanya mengubah seluruh wajah tua itu jadi muda.

"Ledger kedua," kata Briar. "Salinan palsu. Bukan salinan biasa—kabut tidak bisa dibohongi oleh tinta biasa, dan jubah abu membaca kebenaran kertas, bukan tulisan. Maka salinannya harus dibuat dari bahan yang mereka tidak pernah sangsi: kabut itu sendiri."

"Kabut bisa ditulis?" tanya Bandel, tercekat.

"Kabut adalah ingatan yang belum selesai dibicarakan," jawab Briar, mengulang pelajaran paginya sendiri. "Maka ingatan yang sudah selesai bisa dipangkas menjadi kabut yang tunduk. Aku butuh tiga hal: satu malam di Gerbang Kabut Asam, pengukur kabut yang paling presisi yang pernah ada—" ia menoleh ke Rani, "—dan seseorang yang namanya dikecualikan untuk memegang sampulnya. Karena halaman pertama ledger palsu harus ditulis dengan nama yang tidak bisa mereka tagih. Kalau tidak, mereka akan membacanya dan tahu."

"Dan halaman-halaman isinya?" tanya Rani.

"Kita tulis dengan nama-nama mereka sendiri." Briar membuka ledger asli, membalik halaman demi halaman. "Semua nama di daftar bawah sana—nama-nama yang ditunggu, yang ditagih, yang dicoret. Kita salin semua. Dengan tulisan tangan yang mereka kenal: tangan orang yang selama tiga puluh tahun menulis ulang daftar mereka di bawah sana. Tulisan itu ada di satu tempat lagi di dunia ini."

Ia menunjuk kepingan tali garam di saku Elang.

"Tali itu bercabang dari ruangan. Ia tersentuh tangan penulisnya. Dan kabut yang menyentuh kebenaran yang ditulis tangan itu akan menjadi apa pun yang kita minta—termasuk menjadi buku yang menipu penagihnya."

Bandel mengangkat palu kecilnya, pelan-pelan, seperti baru mengerti untuk apa benda warisannya selama ini. "Aku bisa memukul ritme," katanya pelan. "Kabut di kepulauan kami turun kalau ada yang memukul palu warisan dengan irama yang benar. Ayahku bilang, itu bukan sihir. Itu undangan yang sopan."

Rani sudah membuka papan pasirnya, mengukur, menghitung garis. "Gerbang bisa dibuka penuh hanya dari pilar kiri, dari dalam. Butuh satu orang di dalam, mempertahankan segel, sementara kabut yang kita tulis dialirkan keluar. Satu orang saja—yang tidak bisa ditagih."

Empat orang di bilik itu saling pandang. Tidak perlu suara.

"Jadi begini," kata Elang akhirnya, dan suaranya pelan, tetapi di dalamnya ada logam yang sama dengan logam lentera: "Fajar nanti, Orde Abu menerima ledger palsu yang ditulis oleh tangan di bawah sana, dibuka penuh oleh palu Bandel, diukur oleh Rani, diserahkan oleh aku—dan di dalam gerbang, kabut yang mereka kira adalah senjata mereka akan berbaris keluar dengan nama mereka sendiri, satu per satu, seperti sumpah yang dibacakan."

Ia menggenggam lentera yang menyala. "Kau bilang aku jadilah lentera yang tidak menyala di tempat yang mereka duga." Ia menoleh ke arah bawah—ke arah lorong, ke arah ruangan, ke arah penunggu daftar. "Maka malam ini, biarlah mereka menemukan cahaya di gerbang. Di tempat yang salah. Untuk pertama kalinya dalam tiga puluh tahun... giliran mereka yang dihitung."

Di bawah, jauh, daftar menunggu diperbarui. Dan di langit pesisir, kabut pertama turun—mengikuti ritme palu yang belum dibunyikan, seperti pengikut yang sudah lama menunggu komandannya datang.`,
  },
  {
    title: "Bab 9 — Malam Palsu yang Jujur",
    text: `Mereka bekerja sampai sebelum fajar.

Rani mengukur gerbang tujuh kali, dan setiap kali hasilnya berbeda—karena kabut yang baik untuk ditulis harus dikalibrasi mengikuti detak jantung penulisnya, dan jantung Elang malam itu berdetak seperti palu Bandel yang belum dibunyikan: cepat, teratur, tak mau kalah.

Briar mengajari mereka cara menulis dengan kabut: pegang lentera dengan tangan kiri, ucapkan nama yang akan ditulis dengan napas yang keluar, dan biarkan jarinya hanya menjadi pena. Tinta bukan dari lentera. Tinta dari ingatan.

"Nama pertama," kata Briar. "Bacakan."

"Rega, pendeta jembatan selatan," baca Elang dari ledger asli. "Menunggu. Ditulis tahun pertama."

Dan kabut yang ditarik dari gerbang oleh lentera itu mengalir ke halaman pertama ledger palsu, membentuk huruf-huruf yang identik dengan tulisan tangan di bawah sana: Rega, pendeta jembatan selatan. Menunggu. Ditulis tahun pertama.

Nama kedua. Ketiga. Kesepuluh. Ratusan.

Bandel memukul palu warisannya dengan irama yang diajarkan ayahnya—tiga lambat, dua cepat, satu diam—dan di setiap "satu diam", kabut di gerbang berhenti, berdiri, seperti pengikut yang menunggu perintah berikutnya. Para murid Akademi yang mengintip dari jendela asrama menyebutnya mukjizat. Briar menyebutnya pekerjaan.

Pada nama keempat ratus, tangan Elang gemetar.

"Sudah cukup," kata Rani lembut. "Ledger asli hanya punya enam ratus dua puluh nama. Kita sudah setengah."

"Tidak." Elang meraih napas, meneruskan. "Kalau kita hanya menyalin setengah, mereka akan membuka bukunya, membaca halaman terakhir, dan tidak menemukan namanya. Halaman terakhir harus penuh. Halaman terakhir adalah satu-satunya halaman yang akan mereka baca dua kali."

Briar memandanginya lama, dan di matanya ada sesuatu yang bukan kekaguman—lebih dalam dari itu: pengakuan. Orang tua yang melihat anak sahabatnya menumbuhkan tulang punggung yang sama.

"Pernah kau dengar cerita tentang Seruni, Lentera Pertama, di medan perang?" tanyanya pelan, sambil meneruskan menulis di baris sebelah, tangan kanannya, tangan yang lebih tua, ikut gemetar. "Tiga puluh tahun lalu. Dia bukan penyulut terkuat. Dia penyulut yang tidak pernah berhenti di tengah kalimat. Api menara dipadamkan, semua orang lari, dan dia berjalan—jalan, anakku, bukan lari—menyeberangi medan yang masih panas, mengucapkan nama setiap orang yang terancam, satu per satu, sampai selesai. Karena dia tahu nama yang tidak sempat diucapkan adalah nama yang bisa ditagih. Dan dia menolak meninggalkan satu pun."

"Nah, malam ini," Briar menutup kalimatnya dengan satu sapuan tinta kabut, "kau melakukannya di medan yang lebih licin. Tidak ada api. Tidak ada perang. Hanya penagih yang datang fajar. Dan satu anak perempuan yang menolak berhenti di tengah daftar."

Fajar hampir. Ledger palsu selesai: enam ratus dua puluh nama, ditulis oleh tangan di bawah sana lewat cabang talinya, diikat dengan sampul yang ditulis nama Elang—satu-satunya nama yang tidak bisa ditagih.

Dan ketika langit mulai kelabu, mereka berempat berdiri di lapangan gerbang. Rani di pilar kiri dengan papan pasirnya. Bandel di tengah lapangan dengan palunya, memukul ritme pertama yang resmi—tiga lambat, dua cepat, satu diam. Briar di sisi Elang, tongkat kaca cekungnya siap.

Di seberang lapangan, enam jubah abu menunggu. Daru melangkah maju.

"Ledger?" katanya.

Elang mengulurkan buku itu dengan dua tangan, seperti dulu ibunya menyerahkan lentera—dan jujur, karena itu satu-satunya bahan yang tidak bisa dibaca oleh kabut: "Di dalamnya ada namamu juga, Daru. Halaman tiga ratus dua belas. Kau sudah lama ditunggu."

Sesuatu melintasi wajah Daru—sedetik keraguan, sedetik ketakutan yang ditutupi senyum salesman—lalu ia meraih buku itu dan menyerahkannya kepada kerudung tertinggi di belakangnya tanpa membacanya.

"Kau melakukannya dengan benar," kata Briar pelan pada Elang. "Sekarang, jangan berkedip. Yang akan terjadi berikutnya cepat, dan tidak akan terlihat seperti yang mereka rencanakan."

Kerudung tertinggi membuka ledger. Membaca halaman pertama—nama pertama, tinta kabut, tulisan tangan yang dikenalinya bahkan dari jarak sepuluh langkah. Ia membaca nama kedua. Ketiga. Kesepuluh. Dan di nama kedua ratus, tangan kerudung itu mulai gemetar, karena bukan isi yang membuatnya gemetar, melainkan apa yang hilang di dalamnya:

Tagihan. Di ledger ini, tidak ada satu pun nama yang berstatus "menunggu dibayar". Semua berstatus "sudah dibayar". Tiga puluh tahun tagihan Orde Abu, tercatat lunas—oleh tangan yang mereka kira adalah milik mereka.

"Bagaimana—" suara kerudung itu pecah untuk pertama kalinya dalam tiga puluh tahun. "Ini palsu. Ini—"

"Kau yang mengatakannya," kata Elang, dan langkahnya maju ke tengah lapangan, dan lentera di tangannya menyala putih keperakan—penuh, tenang, tidak menyilaukan. "Aku tidak pernah bilang itu asli. Kau yang mengambilnya tanpa membaca. Dan sekarang kau sudah membacanya. Di depan semua orang. Dengan kedua tanganmu."

Ia mengangkat lentera sedikit.

"Di dalam tradisi kalian, bukan? Setiap nama yang dibacakan pemegang lentera—dengan jujur—adalah nama yang harus dijawab. Kalian yang mengajarkan itu ke akademi. Kalian yang memaksa mereka belajar begitu. Maka dengar baik-baik, karena aku hanya akan membaca sekali."

Dan Elang—anak perempuan mendiang Seruni, pemegang pengecualian, lentera kedua—mulai membacakan nama-nama di ledger palsu itu. Dengan suara jujur. Dengan napas yang benar. Satu per satu. Tiga lambat, dua cepat, satu diam.

Dan di langit pesisir, kabut yang turun semalaman itu—kabut yang telah ditulis, dikalibrasi, diundang dengan sopan oleh palu Bandel—berhenti di udara, menghadap enam jubah abu, dan mulai bergerak maju mengikuti suara yang membacakan nama mereka sendiri.

"Nama kedua ratus lima," suara Elang terdengar di seluruh lapangan, "Pemegang jubah tertinggi. Status: sudah dibayar."

Kerudung tertinggi itu menoleh ke belakangnya. Kabut berdiri tepat di belakangnya.

Kabut itu tidak mengeroyok. Ia hanya—menggenggam. Seperti pemungut yang akhirnya menemukan debitur terbesarnya di acara keluarga.

"Lari," bisik Briar pada sisa jubah abu yang bukan kerudung tertinggi. "Sebentar saja tidak apa-apa. Pintu ruangan bawah tanah tidak akan pernah dibuka untuk yang lari."

Dan di tengah semua itu—di tengah kerudung yang digenggam, para calon yang menonton dari jendela, palu yang masih memukul ritme, dan kabut yang bekerja seperti pegawai yang baru dibayar—Elang terus membaca. Sampai halaman terakhir. Sampai nama terakhir.

Nama terakhir di ledger itu, ditulis dengan tinta yang sedikit lebih tebal, adalah:

"Elang. Anak Seruni, Lentera Kedua. Status: menunggu. Catatan penulis: bukan untuk ditagih. Untuk diingatkan—pulanglah sewaktu-waktu. Ada yang menunggu di lantai yang tidak pernah naik."

Ia menutup bukunya. Lapangan itu sunyi. Kabut menepi, tertib, seperti pegawai yang selesai shift. Dan jauh di atas, di akademi di atas awan, lampu-lampu kecil di pilar gerbang—satu per satu—berbalik dari abu redup menjadi putih keperakan.

Sesuatu yang tiga puluh tahun tertahan di bawah sana, untuk pertama kalinya, menyala ke atas.`,
  },
  {
    title: "Bab 10 — Lentera Kedua Menyala Penuh",
    text: `Sidang Orde Abu bubar bukan karena dikalahkan, melainkan karena tidak jadi diadakan: penagih yang digenggam kabutnya sendiri tidak bisa memimpin sidang. Daru menghilang di tengah kerumunan—dan seminggu kemudian, seorang pemuda bernama Daru muncul di kelas teori Akademi dengan seragam murid biasa, duduk di barisan paling belakang, tidak pernah bicara. Setiap kali Elang lewat, ia menunduk. Kedua kalinya, ia mengangguk. Ketiga kalinya, ia menyisakan di meja Elang sepotong kertas berisi satu kalimat: "Pintu sumur timah kubuka tiga tahun lalu untuk ujian tahun itu. Maaf. Kau melihatnya terlambat tiga tahun." Elang menyimpan kertas itu di saku yang dulu menyimpan kepingan tali garam. Ada nama-nama yang menutup utangnya dengan cara pelan seperti itu.

Kabar lain datang beruntun seperti pasang: Ki Darmo tiba di Akademi lewat lift kerang dengan membawa sekotak roti basi dan wajah yang berusaha tidak terkesan; para penjaga tua menara diizinkan mengunjungi sekali setiap purnama; dan Rani diangkat menjadi pengukur kabut termuda dalam sejarah sayap, dengan papan pasir yang tidak pernah ia letakkan jauh. Bandel ditawari kursi pengajara ritme. Ia menolak—"palu ini bukan untuk digaji," katanya—"tapi kubuka kelas malam, gratis, buat siapa pun yang ingin belajar mendengar."

Minggu-minggu berlalu. Peta suara Briar diperbarui. Ledger palsu diserahkan ke arsip terbuka Akademi—bukan disembunyikan; Briar bersikeras ditaruh di rak yang bisa diakses siapa saja. "Kekuasaan yang menulis nama orang diam-diam harus bisa dibaca diam-diam oleh orang-orang yang namanya ditulis," katanya. Nyala Briar sendiri mulai menyusun surat pengunduran dirinya dari jabatan ketua sayap—tiga puluh tahun cukup, katanya—dan mulai menulis buku: sejarah Orde Abu dari sisi orang yang pernah memakai jubah abunya.

Tapi tidak ada satu pun dari itu yang membuat Elang naik ke puncak atau turun ke bawah setiap hari. Yang membuatnya naik dan turun justru hal-hal kecil: kelas pengencang kabut yang kini ia ikuti bukan sebagai murid luar biasa, melainkan murid biasa; tugas menyulut lampu jalur asrama yang bergilir; dan surat mingguan yang datang dari bawah—bukan lewat burung kondor, melainkan naik pelan-pelan lewat sumur timah, ditulis dengan tinta keperakan di atas kertas kulit ikan:

Minggu pertama: "Daftar selesai. Enam ratus dua puluh nama, semuanya lunas. Tanganmu ayahku bangga."
Minggu kedua: "Guru Seruni—yang tua, yang mengajar kelas pagimu—akhirnya menjenguk. Kami bertengkar soal teh. Kami selalu bertengkar soal teh."
Minggu ketiga: "Tolong sampaikan pada Ki Darmo: jala yang dia bilangkan itu tidak perlu dikembalikan. Anggap warisan dari orang yang tidak sempat bilang terima kasih."
Minggu keempat: kosong. Hanya selembar pola bintang—pola baru. Dan di bawahnya, satu baris: "Lentera kedua tidak lagi menyala karena ibunya menyala. Sekarang ia menyala karena pemiliknya hidup. Itu urutan yang benar."

Dan di minggu kelima, surat itu berbeda lagi. Pendek. Dan pertama kalinya ditulis dengan tinta biasa—tinta hitam, tinta manusia:

"Anakku.

Sidang bubar, kabut bekerja, daftar lunas. Tiga puluh tahun tugas selesai dalam sembilan bab dan sedikit bantuan dari teman-temanmu.

Sekarang dengarkan aku, karena ini bagian terakhir, dan aku akan mengatakannya dengan tinta biasa supaya kau tahu ini bukan kabut yang bicara:

Turunlah sekali lagi. Bukan untuk lentera. Bukan untuk daftar. Bukan untuk perang yang sudah selesai.

Turunlah untuk teh.

Kita belum pernah minum teh bersama. Dan aku sudah tiga puluh tahun menunggu untuk bertanya padamu hal-hal yang tidak penting: kelas siapa yang paling membosankan; siapa anak yang kau sukai diam-diam di kelas pagi; apakah Ki Darmo masih memasak ikan terlalu asin; apakah kau masih takut pada cermin.

Aku melewatkan sepuluh tahun pertamamu, dan itu tidak bisa dibayar dengan daftar apa pun. Tapi kalau kau turun hari ini—jumat ini, jam empat, bawa teh hitam dua sasetel—maka mulai hari ini, yang tertinggal bukan lagi yang tidak pernah naik.

Yang tertinggal adalah yang belum sempat ke atas. Dan itu bisa diatur.

Jalan turunnya sekarang aman. Tali garamku sudah selesai bercabang. Palu temanmu hanya perlu memukul tiga lambat, satu diam.

Jangan bawa harapan yang lebih besar dari satu genggam.

Bawa saja teh.

—Ibumu, yang menunggu, yang sekarang tinggal di tempat yang menunggu untuk naik."

Elang membaca surat itu tiga kali di tepi sumur timah. Yang pertama untuk isinya. Yang kedua untuk tulisan tangannya, yang ternyata condong ke kiri, sama seperti tulisannya sendiri. Yang ketiga untuk kata-kata yang tidak tertulis di dalamnya sama sekali—maaf, penyesalan, tiga puluh tahun—dan justru karena tidak tertulis, menjadi yang paling terasa.

Lalu ia melipat surat itu, memasukkannya ke dalam saku dada—paling dekat ke jantung yang berdetak seperti palu—dan berjalan kembali ke asrama dengan langkah yang tidak tergesa.

Karena ada urutan untuk hal begini. Ki Darmo harus diberi tahu dengan duduk, bukan dengan burung. Rani dan Bandel harus diajak—sebuah keluarga kecil yang terbentuk di gerbang kabut tidak dibubarkan oleh satu undangan teh. Dan Nyala Briar harus dimintai izinnya terlebih dahulu, karena sumur timah itu miliknya, dan perempuan yang memotong jubah abunya sendiri pantas mendengar kabar ini sebelum siapa pun: penunggunya menunggu dengan tinta biasa sekarang.

Sore itu, empat orang duduk di bilik arsip. Elang membacakan surat itu keras-keras, dari awal sampai akhir, dan di kalimat "bawa saja teh", Bandel adalah yang pertama menangis—lelaki gemuk dengan palu warisan itu, menangis paling dahulu dan paling tidak tahu cara menyembunyikannya.

Rani mengukur satu hal terakhir—bukan kabut, bukan gerbang. Ia mengukur jarak sumur timah ke ruangan di bawah sana dengan papan pasirnya, lalu menuliskan hasilnya di sudut: "Empat ratus dua puluh tujuh anak tangga. Dari sini, dengan dua sasetel teh dan satu kue basi, sekitar sebelas menit."

Sebelas menit. Tiga puluh tahun menunggu, dan sisanya sebelas menit.

Elang tersenyum. Lentera di pangkuannya—lentera kedua, lentera yang dulu menyala di gudang, di pantai, di gerbang, di tengah daftar—kini menyala lebih tenang dari siapa pun: cahaya rumah, bukan cahaya tanda. Di dasarnya, ukiran nama itu tetap ada, dan akan selalu ada—bukan karena tugasnya belum selesai, tapi karena beberapa kalimat memang ditulis untuk diingat, bukan untuk diselesaikan:

Menunggu di lantai yang tidak pernah naik.

"Besok jumat," kata Elang akhirnya, bangkit, mengulurkan tangan satu per satu pada teman-temannya—Rani, Bandel, dan Nyala Briar yang mengangguk dengan matanya basah dan menyebutnya murid terakhir yang paling keras kepala. "Jam empat. Teh hitam dua sasetel. Dan kue basi—ki, kau yang bawa, kau memangnya sudah janji tiga puluh tahun lalu."

Ki Darmo, yang datang tepat saat kalimat itu selesai dan mendengar separuh dari semuanya, hanya mengangguk. "Roti basi juga?" tanyanya, suaranya kasar oleh sesuatu yang ia swallow sejak gerbang.

"Roti basi juga."

Malam itu, untuk pertama kalinya sejak lentera itu menyala di gudang lama, Elang tidur tanpa memutarnya. Lentera diletakkan di lantai, di samping ranjang, menghadap pintu—seperti lampu teras yang menunggu orang pulang, bukan seperti tanda yang menunggu dijawab.

Dan di mimpinya, tidak ada kabut. Tidak ada daftar. Tidak ada suara yang memanggil dengan suara ibunya, karena ibunya tidak lagi perlu memanggil lewat kabut—besok jam empat, mereka akan bicara sambil meniup teh, tentang hal-hal yang tidak penting, yang paling penting.

Di bawah sana, di ruangan kecil yang tiga puluh tahun hanya diisi daftar dan menunggu, seorang perempuan menata dua cangkir di meja kecilnya. Cangkir kedua baru saja ia buat dari tanah lantai dan api lilin—kasar, miring sedikit, jelek dengan cara yang paling menyayat hati.

Ia menatap cangkir kedua itu lama. Lalu, dengan tinta biasa, di halaman baru daftar yang sudah tidak berisi tagihan apa pun, ia menulis satu baris terakhir:

"Hari ini tidak ada yang menunggu. Hari ini ada yang menunggu dipanggil untuk makan malam. Bedanya besar. Aku baru mengerti."

Dan di atas, di akademi di atas awan, di asrama lantai sembilan, di ranjang yang dulu selalu dijauhi cermin, seorang anak perempuan penjaga menara tertidur dengan tangan tergantung ke lantai—dan lentera kedua, Lentera Menara Kelabu yang kedua, menyala semalaman penuh untuk pertama kalinya:

Bukan untuk menunjukkan jalan.

Untuk menerangi ruangan.

— TAMAT —`,
  },
];

// --- Runner ---

const SLIM_CHAPTER = (n: number) => ({
  title: `Bab ${n} — Draf Pengisi Kalibrasi`,
  text: Array.from(
    { length: 24 },
    (_, i) =>
      `Bab pengisi nomor ${n} bagian ${i + 1}. Paragraf ini hanya untuk mengisi panjang bab pada data uji pagination. Tidak ada plot, tidak ada karakter, tidak ada klaim SCALE. Kalimat ini diulang dengan variasi kecil agar jumlah kata per bab mendekati webnovel rata-rata tanpa membebani server. Tokoh latihan berjalan di lorong latihan, menyalakan lampu latihan, dan mencatat hal-hal latihan yang tidak akan dibaca siapa pun. Kalimat terakhir paragraf ini selalu sama: data uji adalah data uji.`,
  ).join("\n\n"),
});

const flagshipWords = FLAGSHIP.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0);

const session = await mintSession();
const call = api(session);
console.log(`GAP-051 seed: minting session for owner ${OWNER_ID} OK`);

const flagship = await publishNovel(call, "GAP-051 Lentera Menara Kelabu", "gap-051-lentera-menara-kelabu", FLAGSHIP);
console.log(`GAP-051 seed: flagship novel published (${flagship.chapters} chapters, ~${flagshipWords} words) -> ${flagship.novelId}`);

for (let i = 1; i <= 20; i++) {
  const chapters = Array.from({ length: 3 }, (_, k) => SLIM_CHAPTER(k + 1));
  const slim = await publishNovel(
    call,
    `GAP-051 Kalibrasi Pagination ${String(i).padStart(2, "0")}`,
    `gap-051-kalibrasi-${i}`,
    chapters,
  );
  console.log(`GAP-051 seed: slim novel ${i}/20 published (${slim.chapters} chapters) -> ${slim.novelId}`);
}

const probe = await fetch(`${API}/api/public/novels?limit=50`);
const page = (await probe.json()) as { items?: unknown[]; page?: { hasMore?: boolean } };
console.log(
  `GAP-051 seed: /api/public/novels?limit=50 -> ${probe.status}, items=${Array.isArray(page.items) ? page.items.length : "?"}, hasMore=${page.page?.hasMore}`,
);
console.log("GAP-051 seed: DONE. /browse should now render the load-more control (page size 20, >20 published novels).");
