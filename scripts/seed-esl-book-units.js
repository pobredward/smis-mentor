/**
 * 교재 단원 목록 · 캠프 합본(단권화) 쪽 번호 — appSettings/eslBookUnits
 *
 *   node scripts/seed-esl-book-units.js          # 미리보기 (쓰지 않음)
 *   node scripts/seed-esl-book-units.js apply    # 저장
 *
 * - 원어민 레슨플랜(앱 작성)의 단원 고르기·자동 채우기·"책 보기" 링크에 쓰인다
 * - 책 본문은 저장하지 않는다 (단원 제목·목표·핵심 단어·쪽 번호·링크만)
 * - merge 저장 — 여기 없는 교재·합본은 그대로 둔다. 여기 있는 링크는 덮어쓴다
 * - Canva 링크: 회사 Canva "교재" 폴더(단권화 · Speaking · Reading · Writing) 디자인의 공개 보기 링크 (2026-10-01 만듦)
 * - 자격 증명: packages/web/.env.local (FIREBASE_PROJECT_ID · FIREBASE_CLIENT_EMAIL · FIREBASE_PRIVATE_KEY)
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', 'packages/web/.env.local'), 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '=(.*)$', 'm'))[1].replace(/^"|"$/g, '');

const drive = (id) => `https://drive.google.com/open?id=${id}`;
const words = (s) => s.split(',').map((w) => w.trim()).filter(Boolean);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pagesFrom = (first, step, units) => Object.fromEntries(units.map((u, i) => [String(u), first + step * i]));

// ── Clue 2 (Reading) ─────────────────────────────────────────────────
const CLUE2 = [
  [1, 'Tiny Farmers', 'Fiction', 'Environment', '7-10', '2-3', "Understand how earthworms help the girl's garden", 'Main idea & details', 'garden, water, earthworm, scream, afraid, hole, soil, air, through, plant, tiny, farmer'],
  [2, 'Taking Care of Our Home', 'Nonfiction', 'Environment', '11-14', '4-5', 'Find out what we can do to help the Earth', 'Cause & effect', 'Earth, take care of, clean, use, turn off, less, electricity, make sure, light, walk, drive, together'],
  [3, "Brian's Lucky Day", 'Fiction', 'Adventure', '15-18', '6-7', 'Find out why a boy digs a hole and how he gets money', 'Sequencing', 'discover, bush, map, treasure, pirate, carefully, follow, dig, ground, hard, rock, outside'],
  [4, 'A Trip to Antarctica', 'Nonfiction', 'Adventure', '19-22', '8-9', 'Find out what a girl saw during her trip', 'Finding details', 'vacation, emperor, past, giant, iceberg, reach, island, Antarctica, hike, noisy, curious, delighted'],
  [5, 'Kitchen Math', 'Fiction', 'Math', '23-26', '10-11', 'Understand why children need math when cooking', 'Thinking map', 'kitchen, flour, counter, confused, recipe, need, explain, simple, equal, multiply, everything, instead of'],
  [6, 'What a Useful Number!', 'Nonfiction', 'Math', '27-30', '12-13', 'Find out why people started to use the number 12', 'Compare & contrast', 'pick, each, bend, count, thumb, point to, nowadays, calendar, month, store, dozen, useful'],
  [7, 'The Story of the Kiwi', 'Fiction', 'Nature', '31-34', '14-15', 'Find out why the kiwi has no wings', 'Sequencing', 'forest, problem, die, insect, decide, leave, live, dark, complain, brave, wing, forever'],
  [8, 'Talented Sea Lions', 'Nonfiction', 'Nature', '35-38', '16-17', "Learn about sea lions' looks and talents", 'Finding details', 'trick, aquarium, probably, face, bark, flipper, move, weigh, grow up, teach, catch, clap'],
  [9, 'A Healthy Plan', 'Fiction', 'Health', '39-42', '18-19', 'Find out why a boy makes a plan and how he changes', 'Cause & effect', 'join, practice, tired, wrong, properly, skip, exercise, plan, healthy, energy, score, goal'],
  [10, 'Footsteps in the Night', 'Nonfiction', 'Health', '43-46', '20-21', 'Find out what causes sleepwalking', 'Problem & solution', 'suddenly, footstep, sleepwalk, awake, reason, illness, fever, scientist, relax, regular, schedule, surprised'],
  [11, 'A Lesson from a Monkey', 'Fiction', 'Tales', '47-50', '22-23', 'Find out why a monkey lost all his peas', 'Sequencing', 'wise, travel, rest, feed, pea, handful, climb, lose, sadly, learn, lesson, greedy'],
  [12, 'Happy Endings', 'Nonfiction', 'Tales', '51-54', '24-25', "See how Andersen's life is reflected in his stories", 'Finding details', 'mermaid, ugly, duckling, easy, laugh at, write, fail, finally, successful, similar, character, happiness'],
  [13, 'Birthday Traditions', 'Fiction', 'Culture', '55-58', '26-27', 'Learn about birthday traditions in Denmark and Brazil', 'Compare & contrast', 'phone call, celebrate, hang, flag, somebody, gift, next to, wake up, decorate, shaped, vegetable, pull'],
  [14, 'Shoes from Around the World', 'Nonfiction', 'Culture', '59-62', '28-29', 'Learn about traditional shoes in different areas', 'Finding details', 'traditional, dirt, event, slipper, soft, comfortable, take off, skin, area, toe, curl, upward'],
  [15, 'A Fun Trip to the Museum', 'Fiction', 'Art', '63-66', '30-31', 'Find out about fun experiences at the museum', 'Finding details', 'visit, museum, statue, various, gallery, touch, painting, thick, full, artwork, brightly, knight'],
  [16, 'Try Tie-Dye!', 'Nonfiction', 'Art', '67-70', '32-33', 'Learn how to tie-dye a T-shirt', 'Finding details', 'cloth, create, prepare, rubber band, dye, soak, tie, boil, pot, rinse, remove, dry'],
  [17, 'My First 3-D Movie', 'Fiction', 'Entertainment', '71-74', '34-35', '', 'Sequencing', 'movie theater, put on, glasses, dizzy, screen, image, amazing, seem, fall, beat, fast, excitement'],
  [18, 'We Love Peanuts', 'Nonfiction', 'Entertainment', '75-78', '36-37', '', 'Characters', 'comic strip, recently, anniversary, print, newspaper, popular, understand, daily, often, lazy, shy, give up'],
  [19, 'Pedal Power in My Village', 'Fiction', 'Technology', '79-82', '38-39', '', 'Finding details', 'village, pedal, washing machine, work, laptop, guess, street, take turn, battery, until, protect, ride'],
  [20, 'The RoboCup Challenge', 'Nonfiction', 'Technology', '83-86', '40-41', '', 'Finding details', 'take place, different, cheer, compete, hope, beat, human, junior, take part, include, rescue, design'],
];

// ── Right 3 (Writing) ────────────────────────────────────────────────
const RIGHT3 = [
  [1, 'Traveling Abroad', 'Descriptive writing', 'Write about the city you want to visit.', 'would like to · possessive determiner its', 'travel, abroad, city, visit, landmark, tourist attraction, be famous for'],
  [2, 'My Favorite Class', 'Expository writing', 'Write about your favorite class.', 'learn how to · the passive voice', 'art class, music class, science lab, computer lab, talented'],
  [3, 'A Fight with My Friend', 'Narrative writing', 'Write about a fight you had with your friend.', 'so ~ that · gerunds', 'fight, angry, upset, annoyed, apologize, accept, apology, rumor'],
  [4, 'Around My Neighborhood', 'Descriptive writing', 'Write about your neighborhood.', 'transition words (emphasis) · present perfect · prepositional phrases', 'neighborhood, bus stop, pharmacy, library, grocery store, close to, next to'],
  [5, 'If I Had a Lot of Money', 'Creative writing', 'Write about what you would do if you had a lot of money.', 'cost + person + money · conditional sentences', 'donate, charity group, spend, cost, collect, save your money'],
  [6, 'A Great Person in History', 'Expository writing', 'Write about a great person in history.', 'thanks to · complex sentences', 'inventor, composer, scientist, admire, invention, accomplishment'],
  [7, 'Hope You Feel Better', 'Card', 'Write a get-well card.', 'must be · past progressive', 'hurt, hospital, condition, feel better, get well, catch the flu'],
  [8, 'How to Make Spaghetti', 'Instructional writing', 'Write a recipe for something you can cook.', 'transition words (sequence) · imperative sentences', 'chop, boil, stir, fry, peel, add, spaghetti, onion'],
];

// ── Speak 3 (Speaking) ───────────────────────────────────────────────
const SPEAK3 = [
  [1, "He's Smart and Friendly", 'Describing personality', 'honest, careless, shy, greedy, lazy, neat, adventurous, hardworking, creative, talkative, stubborn, jealous, club, love to, visit'],
  [2, 'My Dream Job', 'Speech about your dream job', 'astronaut, chef, planet, cheer, exercise, interpreter, discover, language, space, autograph, grow up, thousands of, curious, musician, play'],
  [3, 'Have You Ever Eaten a Durian?', 'Talking about your experiences', 'penguin, triple, meat, giraffe, foreign, aquarium, journalist, bungee jumping, fall in love with, surf, lie, scuba diving, travel, host, ever'],
  [4, 'Beautiful Places', 'Describing a place in a picture', 'countryside, hill, grass, peaceful, river, graze, cloud, bush, lonely, elephant, palm tree, southern, autumn, lamb, during'],
  [5, 'What Does It Look Like?', 'Describing objects', 'glass, fabric, flour, mittens, strap, rectangular, be made of, square, oval, hole, leather, plastic, checkered, pattern, badge'],
  [6, 'If I Could…', 'Speech using your imagination', 'useful, scenery, outside, object, airplane, rich, communicate, change, fashionable, imagination, soccer, different, wallet, cell phone, laugh'],
  [7, 'What Should I Do?', 'Giving advice', 'grade, cheerleader, lost, truth, tease, street, bring, situation, cheat, instead of, move, fail, feeling, girlfriend, matter'],
  [8, 'Which Do You Prefer?', 'Speech about your preferences', 'castle, roast, prefer, campfire, ride, scream, giant, shore, wildlife, put up, rafting, activity, picnic, snorkeling, marshmallow'],
  [9, 'Classroom Rules', 'Discussion', 'play tricks, trash, dangerous, agree, vote, hallway, hurt, copy, bother, miss, joke, disagree, late, part, manner'],
  [10, 'Agree or Disagree?', 'Giving opinions', 'noisy, quickly, stress, emergency, necessary, adult, rude, function, disturb, educational, rule, opinion, important, release, break time'],
  [11, 'The Magic Pencil', 'Role-playing', 'donkey, teeth, fantastic, thorn, kick, whatever, prickly, relax, write down, awesome, look down, scared, news, flag, project'],
  [12, 'A Wonderful Game', 'Storytelling', 'guitar, nephew, electric, last, stand, present, hit, loud, raise, decide, catch, through, towards, ocarina, player'],
];

// ── Canva 공개 보기 링크 (회사 계정 Canva 폴더 "교재" — 2026-10-01 만듦) ──────────
const CANVA = (path) => `https://www.canva.com/design/${path}/view`;

// ── 교재 — 앱 교재 이름(eslBooks) 기준. 단원 목록은 있는 교재만 ─────────────
// links: Drive "SMIS 교재" 폴더 파일 (모두 링크가 있는 사람 보기 가능)
const BOOKS = [
  // Speaking
  ['Kids 1', 'Everyone, Speak! Kids 1', 'speaking', 'DAG7q5PJ9rU/rrYzXvkv9JNbJisxH9JFbg', [['Student Book', '11LUucHFk-5jEq9yCfqAyxjyyqsOsRqaU'], ['Word List', '1HvenfUjP1nF_SAY4GI3YznmqVZ_s1JIQ'], ['PPT', '14UQ0VtfZAq17pBHjgBhV3FoZrjwnyaK6'], ['Flashcards', '1zUKAO6Xlll1puI7F5B4yX7BGbgJ7Sbzt'], ['Audio', '1pdPbLmpEECKKFaIdN1xhw-eqq_2axGY2']]],
  ['Kids 2', 'Everyone, Speak! Kids 2', 'speaking', 'DAG7qxsboyk/QJzEBxD5R6_m2mS-DAzCLQ', [['Student Book', '1qU3NwTjhHKGr1A1eP89iEqDXzEYsxDsx'], ['Word List', '1Gg5jzAw5lKy_oDCXei1t2yXIfXIin3n0'], ['PPT', '1ypNJEzi3iSgX0ePugb4Po4unSJtYpKzL'], ['Flashcards', '1-iO2WzWdUBHFy_KOAX1E7sHjbNvnAoLF'], ['Audio', '1UNR0NyniXOwN5crqcujDf7yP7_ZAUZip']]],
  ['Speak 1', 'Everyone, Speak! 1', 'speaking', 'DAG7q9NKc2g/MT6UVTd_pcH-8q_yIkxSJg', [['Student Book', '1NaX6KCqHAA1HzGtAHPrX4FUWeWq5Kt4J'], ['Word List', '1FqSMAY4PINxMW3HIjCLklu9DTOR4ZK1Z'], ['PPT (1)', '1r38KWz5dLeZK0L5qR2dcxjCBl4IWJ895'], ['PPT (2)', '1mXDSWQ-48nqsM_U3Gmjt_kx5-DJix3Z2'], ['Audio', '1ATox9VheNguLfn5RvIE0Ms3KOUHLK_nE']]],
  ['Speak 2', 'Everyone, Speak! 2', 'speaking', 'DAG7q2prXwg/Eg9gYaXQvtQQhFVE027wgg', [['Student Book', '17FoUPiM1xB_EvvtHti3l8PFRBUdVZ8yz'], ['Word List', '17nfcY9VcGhcFmTp18sNBnFWVV1uajZ2u'], ['PPT (1)', '1-7hWOCwH9sWy8s1D1u61p38QdNoF5WKv'], ['PPT (2)', '15Zud9D32P1jH493T9wKhty1ktQ2stf3o'], ['Audio', '14zSKDALFRpDxuyacua5-B7-Ff0nO9lG4']]],
  ['Speak 3', 'Everyone, Speak! 3', 'speaking', 'DAG7q2tmvGQ/xRQ2djyclmIsF5GS3I2Sfw', [['Student Book', '1BMpn8NlnGtSUezLVNu00Ybg9zoobdPoC'], ['Word List', '1fos-PqnsV8iQIFkBk_DiMML8CjSFNQ5H'], ['PPT (1)', '1AtW4gLp2OKGxSBkhCsLkGTO1B3z3bMPq'], ['PPT (2)', '1MqhvZJskCbS0zI96uwZIqtx0CkPhhQDq'], ['Audio', '1ySVwPZAWYkYGVHXONWjCXAy1N7h9-uog']]],
  ['Drive 2', 'Speaking Drive 2', 'speaking', 'DAG7q04efBI/BgYfj6xcbiq7YtB8CcDgOQ', [['Student Book', '1ir3vUNs4_5KdY3VzgcL0FdMRhzSZ-lq6'], ['Lesson Outline', '1uuGB0xeWAOMvrofg9A_6d13y7jCG3Et6'], ['Routine Card', '1kHWTqLhzomosCFKexcCGuX6dtyg4PQAX'], ['Transcripts (SB)', '17g8DRmlkssCkX-YbbF0NPwkJQ5Utss_n'], ['Transcripts (WB)', '1bX5CtmOcjdas_ML4qqz8y0qgQdKTxJZJ'], ['Track List', '1ovw48LcoL4VbTiIVAz10-R3it_DfP3AH'], ['Audio (SB)', '1PdQm2R1dnklOH3ndJgtjGFkXskzZYbs6'], ['Audio (WB)', '1id0ewIG0k9cFOeBquyunB0Gw5IWQzGd0']]],
  ['Drive 3', 'Speaking Drive 3', 'speaking', 'DAG7qxYXUcY/uuyzwlyAus5vyYDkicNoNA', [['Student Book', '1Bn5ybI18DkYcZDwN5MzZQ7tR8WHow_s_'], ['My Word Journal', '17jPatvyDAMC7ODhFjIlhb4Rdt4LnONw4'], ['Audio', '1AcOAi8xM5qpwU47rN-Q-hbhFE4j2zh4K']]],
  ['Drive 4', 'Speaking Drive 4', 'speaking', 'DAG7q0Ula_o/DwuMnS24qQhRXDRB4y0GAw', [['Student Book', '1D0TYMDT8cBx5ZDm9VXuMiSIWEBkFRlKi'], ['My Word Journal', '1q3dQ7Nb_lwr_HBAcLq0s2zgP4hPUbNXl'], ['Audio', '1jPUO9tSGchrORbXN3thFQrqVK-Ksq8Y2']]],
  ['Debate 1', 'Exploring Debate 1', 'speaking', 'DAG7q2UQZi8/Zqd5BJo4bsWfn-9o2EqgqA', [['Student Book', '1XBR_Skpkq2CZifxswbhDhrT7Bjp1g4EE'], ['Answer Key', '1koDe3fymzANJ0bKhW4S0nCuWGXr9GtPL'], ['Word List', '100EVWTZyTjHGVtegTNIWhvKgN_noL_xn'], ['Audio', '1rwx0O6nVHKlMnUZyhdck6HTajLcUeZe1']]],
  ['Debate 2', 'Exploring Debate 2', 'speaking', 'DAG7q8Hh0U4/I2IJVUp-0NyuiP9XvnU0fQ', [['Student Book', '1JOtEDUhiH2Lws1aB26Kkd-A6xJtA5dVm'], ['Answer Key', '12OWmL3n-xxCIlZTI0O1OYL9yhE_1Efh_'], ['Word List', '1NZ4CfCRV34dep-eFv77nicjBUcogg44r'], ['Audio', '1t4szrNZhxsU24oh16-WvfFmI5w4LIBDc']]],
  ['Corner 2', 'Four Corners 2', 'speaking', 'DAG7qyRszsQ/SfhmXgzADYHaDDHv5J0B9w', [['Student Book', '1y12nliTPWtcAmsQ3Zid4p6yzfS3MH6CK']]],
  ['Corner 3', 'Four Corners 3', 'speaking', 'DAG7q_G_ui0/LBWZDbo6HQvCheU26YhgBg', [['Student Book', '1rmKViU0I8rmH5mvj4seddEZCUhiRPLw8']]],
  ['Interchange Intro', 'Interchange Intro', 'speaking', 'DAG7q__Iqh4/93p8MD5tdH6sczt6N3chGA', [['Student Book', '11t4O8DG7QKlWXOuVEmWmtBUSqmq0aPdD']]],
  // Reading
  ['Sketch S 2', 'Reading Sketch Starter 2', 'reading', 'DAG7rL9MI60/LQsES3rmvppWh0sMlzORtQ', [['Student Book', '1Mv8jEPcTgz6owBDZD0p2074ueWgTnZoP'], ["Teacher's Guide", '1YEMP1lsD7o8kWSb7uAJ_I2FnikRgcsGx'], ['Answer Key', '1_b4vmfIcINgRukEglv1bW8AqgkoESN6d'], ['Workbook Answer Key', '1wYPV4TYZeGM_IaEtX3tbnn8KqYTR0d6v'], ['Word List', '16VsmpWLSwc1Sxr1yGzA-G6o2cLG_Algi'], ['Flashcards', '1___K_Y8kpooJJXOAa4X6TlXOMyDP0RUY'], ['Audio', '1P1UXw3xntcUiVMNlihI9l2J8p13AzGYF']]],
  ['Sketch 2', 'Reading Sketch 2', 'reading', 'DAG7rD4WYUg/4IArTjfD_BWfW6slRi1s7w', [['Student Book', '1LOUZ8ORxHRqyZebCTtC8XMHl-tveerHf'], ["Teacher's Guide", '1TRTZ1RK41MhGUOtzRTRvYsbWeoC9njiT'], ['Answer Key', '1yZJ8keDaBGIa6-ROLQ10IN7jmLO5sxXg'], ['Workbook Answer Key', '1omvT_4NOyzniVwJthl_MN6nvOAg8cSKh'], ['Word List', '1InJB1E4_gQg948QNmgfqxXdyqM0drYy2'], ['Monthly Schedule', '1CpcxkgizcELGnBqAp32BdG5hDmdbzkRL'], ['Audio', '1bJ_LoL44YgcpS7NWr7YihTSUqvGNA3mM']]],
  ['Sense 1', 'Reading Sense 1', 'reading', 'DAG7rGmumik/mePiyvRAt6WKPgOQfO73YQ', [['Student Book', '1o5fFoHgZMTlAedqPTEBoRFO4jGlaEUSC'], ["Teacher's Guide", '1rrtR8ofq-NbjDfnmyw7htYuSrBGqT_1P'], ['Answer Key', '11Vn2peh29gxZngE8u2-u-hrdT972v0YQ'], ['Workbook Answer Key', '1O-mVA3V5M14sXPh1AAA6Mr2T1WvTEKyt'], ['Word List', '19APdZ55U7KmiZPLylIIdzRTwHHPm9bqX'], ['Daily Plan', '19jbgtmzEWNYrj8JrQooVE5mqcx18RxPI'], ['Monthly Schedule', '1pVg6GJwqO_Hgfy517J94fjZ5KwZGlW0Q'], ['Unscramble Worksheets', '1QUzDVNUXxnnLIcFxjbk4NtsHlWTpk_li'], ['Audio', '10QYX2R6XJVduDPYuFXVJOCcLGH58HeAH']]],
  ['Sense 2', 'Reading Sense 2', 'reading', 'DAG7rGjZdfc/8l0OZRh9ONvfD8MT3wL4jQ', [['Student Book', '11qHNu-4BeDHrKbKVLWJyBiIeG8HJMYI-'], ["Teacher's Guide", '1rFlOw6ISUfCyiYHI0NqhRlGN3duTFIcl'], ['Answer Key', '1eR_0QOtQgo5PhTccHoLVx3ilXk-t7FXh'], ['Workbook Answer Key', '1dimNaWr__8Wy61yWWSfBshMVu1RBUgwA'], ['Word List', '1Aobqqsi3j2XPxJ3DDus8SrEop0E8Vs52'], ['Monthly Schedule', '1WMqDCdEuUM6zo4i-SmLZicLPcWjzn1rH'], ['Unscramble Worksheets', '1-EPWnSyZd4pQ79EgiBhzUqRRCDu_bMsP'], ['Audio', '1euFHT65ArATI_BJxF9vNEC1CwklKp2Rj']]],
  ['Sense 3', 'Reading Sense 3', 'reading', 'DAG7rJpbCnY/AjsaV446PLBeNAERg23zcQ', [['Student Book', '1S08Six9vaYm7YfMgDGA-rzTe4OqNUGML'], ["Teacher's Guide", '1ySHWyDbsUd8h7XxbMmV1uRyvoyOwGyOU'], ['Answer Key', '1aGIgWSmnYuyyNSGA_t4Nzg8_zEOKxaet'], ['Workbook Answer Key', '16fAzttYEqYzOA9Qd9A_G3xOr0Yu4rmK6'], ['Word List', '1cvhMqfSxKI2dzLFPxX0AbUtYGHvSLjnZ'], ['Monthly Schedule', '1zFPzov5nxTFGZ2reqbVHOTm7nOBFmZ4h'], ['Unscramble Worksheets', '1hW7avaCaBaLRZtESW_eiNq4AxZTgxSBJ'], ['Audio', '12aVX37Ef1_y3ezCthphZP3OV4ZuQzJ0_']]],
  ['Clue 1', 'Reading Clue 1', 'reading', 'DAG7rDoMxB0/wD4vCzE_YCPI022kf47-JA', [['Student Book', '1stDlIIDReRdFnwTOThteuU1MmEi2l_15'], ["Teacher's Guide", '1CneHQy8cCk1n4dzA9c5boOK_2_slSLHD'], ['Answer Key', '1mlXG0CBuaxivfyIBlBwkP87a7AyjV13E'], ['Workbook Answer Key', '1fw63oBbdn-yeUsucXU1-y6d8E_5Hso1y'], ['Word List', '1Y23EhTCHwmKL4O9S72qA253fF8KZeL33'], ['Daily Plan', '1hEMjIXovfn2JkcLb9GziViqOBZ7Egr8d'], ['Monthly Schedule', '18tjg8Aon4w0c-kS2XD_jdFDzFQ-2Uagg'], ['Unscramble Worksheets', '1DGUQzdVYgMLjERR79dP445MelZQzC9Sx']]],
  ['Clue 2', 'Reading Clue 2', 'reading', 'DAG7rDLcspE/LE5VmGxjx6M55yYjYvNRXA', [['Student Book', '1jYkhEoHwTb9WDR8OOm0v05683UVhchnE'], ["Teacher's Guide", '1D6I6PWnJCH0iv9gvArY1SbSyncIe2yBB'], ['Answer Key', '1NTLKeMV3y5t49GE2PS-_7MGNEe0Q8xwM'], ['Workbook Answer Key', '1mZSoMFs9K8ERyIYphqh7IXBKM9gumbjY'], ['Word List', '1tj9IonKnb0Wq3SYni9732oPGtMrNjZmH'], ['Monthly Schedule', '1xT_7Vs2MiQahaFTR66eNi70TAxffHZzt'], ['Unscramble Worksheets', '11VugIzXGv-9svXy-tVwoJOvMkqTLPPT5'], ['Audio', '1nkpDSETh8MgJDDqOKwp8LBSKh41Z48fH']]],
  ['Clue 3', 'Reading Clue 3', 'reading', 'DAG7rIZAxpA/j5Gwra58roxRKAfwWxna8g', [['Student Book', '1i7XRb5RqqM35nfiqba2ORJO5UDulGApJ'], ["Teacher's Guide", '16OQGcJCI5KJZquiMFX3Az9YcgCD3lHEO'], ['Answer Key', '1QNVga3gBHxNIxz_tRXD0k08n8M5Hpu-z'], ['Workbook Answer Key', '1mt9QD0ljApEwGxlOyH1Ffl-UED4yTonR'], ['Word List', '1grynCXwEpKcjks5P8R22ZqkQ-GOsYzlV'], ['Monthly Schedule', '1df81Sgu3PeT4DgYjznJgYyNkKheHMadY'], ['Unscramble Worksheets', '1abmc4pE8VSTjSNpVtUbF8DHFkYdjYsIM'], ['Audio', '15JiPHN1TagJKd0Arr72Cc5QU7m2doC7E']]],
  ['Source 1', 'Reading Source 1', 'reading', 'DAG7rHHhdRw/hW5FnAB84XAyy9rfh41VNg', [['Student Book', '13xpSEpzn9VkeUiRnGlL7oIzOwehfBPKC'], ["Teacher's Guide", '1XaeLaAN0zgnqDplFXBeEWiFcGc9DZn6l'], ['Answer Key', '1DZson_W82zInfOpXboq4v36N6D6s4HWs'], ['Workbook Answer Key', '1Wiir2HwTDaq4hAbzQ-rnsoe_zx8IcNPj'], ['Word List', '1IHri4j5R-_vlIogTZix8S7b2wCrQWoYa'], ['Daily Plan', '1tnfwPg_-3E_JljBhFY_HhOmDdoqjL30v'], ['Monthly Schedule', '10KxXahUrHO7MRV_xjEZvkOpIHIFpwND8'], ['Audio', '1dAmZyn9jAZ8ebTrpDEoj1MQhF_g_T-__']]],
  ['Source 2', 'Reading Source 2', 'reading', 'DAG7rEVQk2E/fr5TQZMQ_zL2iU9NjpV7Zw', [['Student Book', '1df1-IAiSy3iTVkiTSjahDQRAg9-atIIU'], ["Teacher's Guide", '1wbR9mRAv9al3NgSnpxLsBIHIbsBIaIr0'], ['Answer Key', '1bn-SaXBO4rQJ46A3hDDeLkedQcruR16n'], ['Workbook Answer Key', '1Xk5pc8Ol9u6NaXRY75U5g42QSKZhhPOJ'], ['Word List', '1JnZaLaO4Nzzr_Mnd8jkXbo20gAUhidvr'], ['Monthly Schedule', '1adichaZ6wk5BHgOxp4PBJlv3Nl5gtVJX'], ['Audio', '1x7nce99OHGMPyZX5YQ79W6fk6e7yEMsF']]],
  ['Source 3', 'Reading Source 3', 'reading', 'DAG7rG-VuIg/ShVwsMSrljwyX3qnj61m1Q', [['Student Book', '1cp92KDANtbFaIdAkqkhN523gJZgZgGaX'], ["Teacher's Guide", '1PVHErATtFH_VkBUJcVLtictssBozTQWh'], ['Answer Key', '1Jv6hxfKEzsSsGjfWgtt15WU2gxaXebBB'], ['Workbook Answer Key', '13X5mtGwablSSjQQeGqN5_c7k3tDnywmc'], ['Word List', '1CyDAef8GxAuXPlyB_P2OdcDm04lyP4jF'], ['Monthly Schedule', '1P_SqIiBXzI7LPuDtmjdLFdirsqb-oPFI'], ['Audio', '1959CeQ-ikMSx0ZpM5EkKP7ASGxe6H6Rf']]],
  ['Best Way 2', 'The Best Way 2', 'reading', 'DAG7rGZK3OU/8hC6TtOGdLP4o1R8YUey4Q', [['Student Book', '1OfPfqElgNlandx8NOWqNtXurIhul8Jrh'], ['Answer Key', '1gpN6ALYjz7C3v2ytQRjI_3D0lY8QWfsQ'], ['Workbook Answer Key', '1cXPZWPJBlAPZv3UA9vp2ef5ht1_ykl_Z'], ['Word List', '1dc8-6xKZfWfcDIb95ZVcLdtf11kvOHdn'], ['Daily Plan', '1YRnELrr-uxElyEDGnQIVmMI8jGotQ6iR'], ['Monthly Schedule', '1d1P8VAk_5FQp-xaXCDjlF4qWWyluS6cc'], ['Audio', '1aKXK60S9lIYQct-nu0sfMEVilISNzTOl']]],
  ['Best Way 3', 'The Best Way 3', 'reading', 'DAG7rMg8Mhw/haT1lHbn6MaEdcG6NNDGxQ', [['Student Book', '1_F838sU31rkVXP6ECvUQYlq50buTGC3i'], ['Answer Key', '1EpXucGwfGTIZmH6kG5M6ko41slLuP9Md'], ['Workbook Answer Key', '1RitI-p24IAnyz8RDkqpEfpdc3j2MQ0gk'], ['Word List', '15U7KnLycSug5rJ2R4viz48ywS3KBZ5ZP'], ['Daily Plan', '1zEmrJdQO-JpZ5Wrc3PY-vaCpAzyjINnV'], ['Monthly Schedule', '1PtrHShv1qSbRA2EhE7HFXRhihimdjQQA'], ['Audio', '1n_af3z8x8kyxo9T1on6145Otlv_6O2I0']]],
  // Writing
  ['Beginner 1', 'Write Right Beginner 1', 'writing', 'DAG7rND01gk/2jF0L_EXIlypeB3pOCHCnA', [['Student Book', '1tjM50KvetDPLMZKFikksKy4qlVSdCQKh'], ["Teacher's Guide", '1awDedS1U52O_Aa495s0Y4IAyl80PjlNB'], ['Word List', '1bHr1H6IeGO62iwjIl5bff_rf_eCxbky2'], ['Daily Plan', '1ISWClZAct90WX927FhfeAk3gRytJso5T']]],
  ['Beginner 2', 'Write Right Beginner 2', 'writing', 'DAG7rHd_jvk/oEh3YZWZRAbTczeEtNlIlg', [['Student Book', '1LfVWoqSO0GYo_z0BHkkQZPCwCo3M6fJz'], ["Teacher's Guide", '1u94DQpjWA3HY3l-HcE6Pv5Dh9T-HFJ_E'], ['Word List', '11weH0I2_koRbi4ut3ix0oNezOqTj1MyG']]],
  ['Beginner 3', 'Write Right Beginner 3', 'writing', 'DAG7rMl2XR8/G2VWWC1vbjVj8Wrt7uMj1g', [['Student Book', '1tkFIhrcpdjmiGDS9LmlKA6oYQrCqBygy'], ["Teacher's Guide", '1ScBpQujxWyDKFfdBKGwsT-CktVCrmKWN'], ['Word List', '1YIpa6zEV9r6lRWFUTCOR8iFPNKKxVN34']]],
  ['Right 1', 'Write Right 1', 'writing', 'DAG7rLN5uwY/NhQtXlKikLIbv29OkPnrCw', [['Student Book', '1Ffoz3Mmwz04Bi5dlu8ClIRM0jOT3kZp6'], ["Teacher's Guide", '1NUzJxITMfe9PoswkDM3SE9Vjzeb-moRc'], ['Answer Key', '1i6RyoSo2HK-1mA6hlWtwGczV_qLS1IO4'], ['Word List', '1BA0F_espWpjc8Ohfk4Jg5dbbC-fm7nwV']]],
  ['Right 2', 'Write Right 2', 'writing', 'DAG7rN5u16g/EhRx2GsjOy1jU8zem2vIKw', [['Student Book', '1b3nTPZ6jogZCZJpHVj7bztu5HAJue1cP'], ["Teacher's Guide", '1zcXsy1he0Uboqz95wa91lUxpCV8I_G66'], ['Scope & Sequence', '1cK1M6TrA6uCJh9v_Fk_49wivMxdtso8a'], ['Answer Key', '1hxBfffEa5GiuxFcDM3Ad3PkKpmZSf5uZ'], ['Word List', '1QDkOmysaNuNEhiOo9sea0B24q-2xaCqK']]],
  ['Right 3', 'Write Right 3', 'writing', 'DAG7rBCC_qc/BuSaMyq9qH1-h3t8KdYL3w', [['Student Book', '1reMlnTW2HwCI9tCAK_Ml4O15bZtgVgjr'], ["Teacher's Guide", '1A5y1mqhpJOkzSpYGdbLDvPQLf5oLRE0l'], ['Scope & Sequence', '1vwp9yEoVSPGfo6ZiK4arvfPsEuvTFyEe'], ['Answer Key', '1PhIqtUFxp8sTzHCR2i52yQ4LdOOc8HwM'], ['Word List', '105zptTRPiVkAfk92NGN4KEiARyGk6iGP']]],
  ['Essay 1', 'Write Essay 1', 'writing', 'DAG7rMv_7vA/AVZ5fYISaQE0um8ZcaICGQ', [['Student Book', '183Hp_WCqprtsoZ-NmqLa-QOHvHXm_VUq'], ["Teacher's Guide", '1P4h8VMbnWeLZIQBFiVVhXxlI-dowsMvm'], ['Answer Key', '1jVj-7NL--T9td_IVs6l0qSajWjpU8JQF'], ['Word List', '15UkaVHagiLmH10FwFPIarYUL-E8SHYcD'], ['Daily Plan', '1MRZRA99kk3seXbIKaXtqnbvySzQhwlCU'], ['Monthly Schedule', '1FDqvC1PFuzDg0nkSWtdlU9iPoMjRDctT']]],
  ['Essay 2', 'Write Essay 2', 'writing', 'DAG7rN4Eo1s/NDX0XCGUq5BLE1uskRKxQQ', [['Student Book', '1MGX0x8sFNMSMwo6bj8_4aO-07Pk1PeD3'], ["Teacher's Guide 1", '1WjEEkJDrwTcE78rd9jXJ59x85e5i0ZVr'], ["Teacher's Guide 2", '1OJm6Fi9JmvxaoZ-HEuBg9JvQlAx566n2'], ['Answer Key', '1jGRIyS68akWuhxuVpV2vxrkzpTBr0Zr7'], ['Word List', '1CwjP4tSe-snKkYPs8_OWSjPwn43UBmq6'], ['Monthly Schedule', '1Ny9wOqOiSI7P6DXoYLeuZqT76O2k8_a8']]],
  ['Essay 3', 'Write Essay 3', 'writing', '', [['Student Book', '15DSJu6acJwmwkqMQ6W8YBfWC2YI6KeC0'], ["Teacher's Guide 1", '1FWSEQb9I75jtFaxDq0zCMf16dlwAOX8m'], ["Teacher's Guide 2", '1Jcic8UTTwRkswqerkCVXxeC979uwAVk7'], ['Answer Key', '16-K5z4QE3TKToAtyu22w6AKUI2GXAbox'], ['Word List', '1dIbOTOfTpbimGYJy-KIRcSwH4FPv3UPm'], ['Monthly Schedule', '1U1W09hhq0c1xFotN0u9YwXqIteIzXP9m']]],
  ['Star Kids 1', 'Writing Star Kids 1', 'writing', 'DAG7rLUvsww/KYc8C85QC57ObxLXB3eX5g', [['Student Book', '1e-VhIMufzKrrIxsZ8LG4QLOO8UQ7roQs']]],
  ['Star Kids 2', 'Writing Star Kids 2', 'writing', 'DAG7rG02_wY/-BVQ6qn1wTzeGM28FlZM7g', [['Student Book', '1J8T27rsfxEAPUerJQ-E4OBmlT1It1jzt']]],
];

// 단원 목록 (진도표 · 단어장 · S&S · 목차 OCR 로 확인한 교재)
const UNITS = {
  'Clue 2': CLUE2.map(([no, title, genre, theme, sb, wb, objective, focus, w]) => ({
    no, title, genre, theme, sbPages: sb, wbPages: wb, ...(objective ? { objective } : {}), focus, words: words(w),
  })),
  'Right 3': RIGHT3.map(([no, title, genre, task, focus, w], i) => ({
    no, title, genre, objective: task, focus, sbPages: `${6 + 8 * i}-${13 + 8 * i}`, words: words(w),
  })),
  'Speak 3': SPEAK3.map(([no, title, focus, w], i) => ({
    no, title, focus, sbPages: `${6 + 4 * i}-${9 + 4 * i}`, words: words(w),
  })),
};

const books = Object.fromEntries(BOOKS.map(([title, fullTitle, subject, canva, links]) => [title, {
  title,
  fullTitle,
  subject,
  units: UNITS[title] ?? [],
  ...(canva ? { canvaUrl: CANVA(canva) } : {}),
  links: links.map(([label, id]) => ({ label, url: drive(id) })),
}]));

// ── 캠프 합본 (단권화) — Canva 공개 보기 + Drive PDF. 쪽 번호는 확인한 합본만 ──
// Bc · Ca 는 같은 책(Speak 3 · Clue 2 · Right 3, 171쪽 같은 순서): Speak 3 U1 = 7, Clue 2 U1 = 42, Right 3 U1 = 108
const BC_PAGES = {
  'Speak 3': { units: range(1, 8), pages: pagesFrom(7, 4, range(1, 8)) },
  'Clue 2': { units: range(1, 16), pages: pagesFrom(42, 4, range(1, 16)) },
  'Right 3': { units: range(1, 8), pages: pagesFrom(108, 8, range(1, 8)) },
};
const BUNDLES = [
  ['Aa', 'DAG7q8jcTrU/-efechY--_WkHI3qbv9Z4w', '1JCncoCcDohBcQyx9A1fvzFi4jrV7z7i5'],
  ['Aaa', 'DAG7q_p1jeM/20miV1MmQitHkwkOt5cZEQ', '1dqnqKnLtuKFNy1uI6aBpjOLRJj3_Y25R'],
  ['Ab', 'DAG7q1iUpC4/nkje2VQ7ltHgqIoa9JaZ9Q', '1ibOFJivVxGsFw5wOAzGTRILXMcFDVv3X'],
  ['Ac', 'DAG7qy-LhnY/2fd0_nJjv7BfADPl2XBt0A', '1y98t3v8mzCG3PqZBU3O_zD1jZUZtHzLe'],
  ['Ba', 'DAG7q5F8YHc/JKnH1hiy4AiUSdsrs8sZaA', '1B_KDVCm7EHtHFVhWcaget1JB2zLZZ-Uh'],
  ['Bb', 'DAG7q-2h0NQ/7EDWKjHzNhhZIMyyTmb4Og', '1O0DExScIV770lh3iP3g7jQj9XFyBXhZ9'],
  ['Bc', 'DAG7q8HLfAc/wE20_JH3Hzhn14cIhk5_1w', '1b_RAbYPf0REITEScAy_Q4dPzTvdKXmvr', BC_PAGES],
  ['Bcc', 'DAG_TPzdKxQ/cw9AwXKLE4HeZ4zW4slwjQ', ''],
  ['Bd', 'DAG7q7zxjas/2GnYxAmvQZDs79r52i82rg', '1TUZJRRVZEM2ZfuEXEF6FbbD1E7QIZ6X8'],
  ['Be', 'DAG7q0YTgS4/QljuUbfIBr8lORdeDl6d0Q', '1ScFoPDEYbnfOvW5YoWKWlhddVCVprN8P'],
  ['Bf', '', '1HG3qWpr5vZqMDK70ITS-XON65EbWyu_O'],
  ['Ca', 'DAG7q8wzyzI/gfhBrWQYXrAuE8OwNbUU8A', '1UUuu4wXafllM1-5B-hZX-pBVbXhAhhjG', BC_PAGES],
  ['Cb', 'DAG7q_V1iDA/wS2J-TrZ9PQYnmGTdaUbNg', '1G82gkIHpa7AEba2_i5DAZQuUaj8QvoQD'],
  ['Cc', 'DAG7qx1wDAk/dSVRReObtX43pXg-Dp59wg', '1dqIvzM7r4iKRMLwb1uvP0OSeOFy-bdU5'],
  ['Cd', 'DAG7q1tRWPA/I9ZLpqkOhY2s3P35MRYudg', '1B5FXyVCbbn0ZNFojYbmjMJI2OPBjkQis'],
  ['Ce', 'DAG7q_pr3Bw/YQjpaWkfRC_vhYWcJ5CAlQ', '1NDHrBTltwfisjfcXSfpcQ1-QLNdJv924'],
  ['Cf', 'DAG7qzB3quQ/19KTremergumT5ep7vJekQ', '1BEYE1igDtE1jr6ukjYtygtQdQyizBlBC'],
  ['Da', 'DAG7qx_3PCg/c7bioUfHOLQq6FbRbRdDfw', '1gt1Eg6TqQmIK7pjLmgN3-L6mFhEeEuJs'],
  ['Db', 'DAG7q34Fv70/zeGAiYuytSJupZI2gepRWg', '1JBSz7BCZdANJLVFz157GdduXsYimweI0'],
  ['Dc', 'DAG7q4OPOWo/UtGSpqrtXikmzO0-vPTLTQ', '1jH3yoAtJg95m0ypkQtwZeN_f1Z0E4B3K'],
  ['Dd', 'DAG7q8qdrXA/75hdxJKulZZflTfqoQPwBw', '1aUL884PKQocfzCLZBrpC48bVTt72TgvC'],
  ['Ea', 'DAG7q3DEUoE/TVN-zBGI7kaMKxVu9Af4pA', '12lQit7ZmTXd2pLV5GxutY-qf_gggaGi6'],
  ['Eb', 'DAG7q7NFfpI/lR8m-gOXGDw07NZRCElVCw', '168zq7Hauu1X8EVwV-mTHDtNQmmOKW_ib'],
];
const bundles = Object.fromEntries(BUNDLES.map(([code, canva, driveId, pages]) => [code, {
  code,
  ...(canva ? { canvaUrl: CANVA(canva) } : {}),
  ...(driveId ? { driveUrl: `https://drive.google.com/file/d/${driveId}/view` } : {}),
  books: pages ?? {},
}]));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: get('FIREBASE_PROJECT_ID'),
    clientEmail: get('FIREBASE_CLIENT_EMAIL'),
    privateKey: get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
});

(async () => {
  const db = admin.firestore();
  const ref = db.collection('appSettings').doc('eslBookUnits');
  const cur = await ref.get();
  const before = cur.exists ? cur.data() : {};
  const esl = (await db.collection('appSettings').doc('eslBooks').get()).data() || {};
  console.log('eslBooks Bc =', JSON.stringify(esl.codes && esl.codes.Bc));
  console.log('current books:', Object.keys(before.books || {}).join(', ') || '(none)', '| bundles:', Object.keys(before.bundles || {}).join(', ') || '(none)');
  console.log(`books ${Object.keys(books).length} (canva ${Object.values(books).filter((b) => b.canvaUrl).length}, with units ${Object.values(books).filter((b) => b.units.length).length}, links ${Object.values(books).reduce((n, b) => n + b.links.length, 0)})`);
  console.log(`bundles ${Object.keys(bundles).length} (canva ${Object.values(bundles).filter((b) => b.canvaUrl).length}, drive ${Object.values(bundles).filter((b) => b.driveUrl).length}, pages ${Object.values(bundles).filter((b) => Object.keys(b.books).length).map((b) => b.code).join(',')})`);
  const esTitles = new Set(Object.values(esl.codes || {}).flatMap((x) => [x.speaking, x.reading, x.writing]).filter(Boolean));
  console.log('eslBooks titles without catalog entry:', [...esTitles].filter((t) => !books[t]).join(', ') || '(none)');
  for (const [c, b] of Object.entries(bundles)) {
    if (before.bundles && before.bundles[c] && before.bundles[c].canvaUrl && before.bundles[c].canvaUrl !== b.canvaUrl) console.log(`  bundle ${c} canvaUrl changes: ${before.bundles[c].canvaUrl} -> ${b.canvaUrl}`);
  }
  if (process.argv[2] !== 'apply') { console.log('\n(미리보기 — 저장하려면 apply)'); process.exit(0); }
  await ref.set({ books, bundles, updatedAt: new Date().toISOString() }, { merge: true });
  const after = (await ref.get()).data();
  console.log('saved. books:', Object.keys(after.books).length, '| bundles:', Object.keys(after.bundles).length, '| Bc canva:', after.bundles.Bc.canvaUrl);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
