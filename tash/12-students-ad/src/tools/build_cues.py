"""«طشّ للطلاب»: build src/cues.json, the one timeline every scene, the page and the audio read.

Inputs: ../script.json (every on-screen string is COPIED from it, never retyped) and src/vo/vo_timeline.json (the VO
edit: tempo, BPM, grid phase, word times). Everything is placed on the 125 BPM grid: beat k is at
PHASE + k * 0.48 s (PHASE = 1.401 s, a bar line; k % 4 == 0 is a bar line); a frame is round(t * 30).
'land' = the frame a text is fully on (on the grid, ~1 frame after its VO word starts); 'in' = the frame its entrance
starts; 'out' = the first frame it is gone (exits end by then). Scene in/out: [in, out) in frames.
    python3 src/tools/build_cues.py"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
AD = os.path.dirname(SRC)
S = json.load(open(os.path.join(AD, 'script.json')))
V = json.load(open(os.path.join(SRC, 'vo', 'vo_timeline.json')))
FPS = 30
BPM, BEAT, PHASE = V['bpm'], V['beat'], V['phase']
END_F = round(V['film_end'] * FPS - 0.25)          # 29.241 s = beat 58 -> 877 frames (29.233 s)


def B(k): return round(PHASE + k * BEAT, 4)                       # film seconds of beat k
def F(t): return int(round(t * FPS))                              # frame of a time
def FB(k): return F(B(k))                                         # frame of beat k
def T(f): return round(f / FPS, 4)


LINES = {l['id']: l for l in S['lines']}
def on(lid, i): return LINES[lid]['onscreen'][i]                  # exact on-screen string


def ui(key):
    """the value of a script.json ui_strings entry, by key (format 'key (notes): value'; the value may hold ':')"""
    for s in S['ui_strings']:
        m = re.match(r'^([a-z_]+)(?: \(([^)]*)\))?: (.*)$', s)
        if m and m.group(1) == key: return m.group(3)
    raise KeyError(key)


def uis(key):
    out = []
    for s in S['ui_strings']:
        m = re.match(r'^([a-z_]+)(?: \(([^)]*)\))?: (.*)$', s)
        if m and m.group(1) == key: out.append(m.group(3))
    return out


W = V['words']
def vo_words(phrases):
    """VO words of the given phrase ids, as [text, start frame, film start s]"""
    return [[w['text'], F(w['start']), w['start']] for w in W if w['phrase'] in phrases]


def word_lands(text, phrases, first_land):
    """per-word land frames for an on-screen string spoken by these VO phrases: each word lands on the frame after its
    VO start (+0.02 s lead on the grid), the first one on first_land (a grid frame)"""
    vw = vo_words(phrases)
    toks = text.split(' ')
    out = []
    for i, tok in enumerate(toks):
        if i == 0: out.append([tok, first_land]); continue
        # match by position (the screen string and the VO phrase have the same words in the same order)
        st = vw[i][2] if i < len(vw) else vw[-1][2]
        out.append([tok, max(out[-1][1] + 1, F(st + 0.02))])
    return out


# ------------------------------------------------------------------------------------------------ scenes
# (fix round, 26 Nov) the s5 -> s6 cut sits on the VO «ويوم…» (c1 moved 0.12 s earlier for air before «خلّ»), so the rule
# line holds 0.9 s after its last word; «بحث؟» lands 5 frames before its word; card 1 flies in as a new object from f232
_c1 = next(p for p in V['phrases'] if p['id'] == 'c1')
S5_OUT = F(_c1['film_on'] + 0.04)
# (fix round 2) «بحث؟» lands on f62 (its hit leads the voice by ~20 ms, like hit 2; was f59, 0.12 s early) and stays
# sharp to f73; card 1 starts its flight on f238 (was f232) so «للطلاب» reads alone for ~0.3 s first
Q3 = FB(1.5) - 2
CARD1_IN = FB(13) + 9
SCENES = [
    {'id': 's1_hook', 'in': 0, 'out': FB(2.5),
     'what': 'Live plate h1_desk (src/footage/h1, frame k = film frame k, 1.25x): night, the student from behind, hands in '
             'hair to 1.6 s, hands drop 1.67-2.0 s. The three questions punch in on the grid. From about beat 1.5 '
             '(2.121) the camera accelerates INTO the laptop screen (screen.json quad_s) and ends on full white on the '
             'last frame (f77): a white match cut into s2.'},
    {'id': 's2_screen', 'in': FB(2.5), 'out': FB(12) + 9,
     'what': 'Inside the laptop screen: OUR generic slide app (no Office UI/logo) from white. Blank slide, «انقر لإضافة '
             'عنوان» low-contrast texture, file name small, clock ٢:٤٧ ص small, the group-chat bubble lands first, the '
             'deadline notification (drawn pin icon, no emoji) drops with the ding on beat 3; «والتسليم… باجر؟» is the only '
             'big line. Runs UNDER s3 from f140; the splash (f215) wipes all of it, gone by its out frame.'},
    {'id': 's3_splash', 'in': FB(7) - 3, 'out': FB(15),
     'what': 'The TASH chat bubble (sender «طشّ», no time, no online dot) pops in over the screen UI with typing dots, '
             'types «المرة الجاية…», then «خلّ التصميم على •••»; on the hit (f215, bar line) its live dots burst into a '
             'lime SPLASH that wipes the WHOLE screen and land as the wordmark «طشّ»; «للطلاب» snaps under it on beat 13. '
             'The dots stay as the wordmark\'s dots (its body lands around them on their row). Card 1 of the parade then '
             'flies in as a NEW object below the lock-up (samples label on from its first frame). The student\'s blank '
             'file is NEVER shown finished. «المرة الجاية…» stays to the cut (f258). Hands card 1 to s4 per handoffs.s3_s4.'},
    {'id': 's4_parade', 'in': FB(15), 'out': FB(33),
     'what': 'The sample parade: 3D cards with depth on the beat, each card\'s chip = its on-screen word (rendered '
             'once), the answer punches in beside it; cards 4-6 one hit each; card 7 Excel (chart draws) + «وأي ملف '
             'أوفيس.» + five LTR file chips; ends on the full fan held ~0.45 s. Starts from card 1 exactly where s3 left it.'},
    {'id': 's5_details', 'in': FB(33), 'out': S5_OUT,
     'what': 'Details: macro push-in on one sample page, alignment guides SNAP onto the margins on «نضبّطها» (f553); '
             'then THE RULE LINE on a before/after of ONE page with the same words both sides: «المعلومة منك…» on BEFORE '
             '(قبل), the swipe on the bar line f618, «والترتيب والتصميم علينا.» on AFTER (بعد). No callout while the '
             'rule line is up. Samples: a report/research page for the margins; before/after = samples/before-slide.png '
             '(the plain BEFORE) against the matching designed slide (AFTER).'},
    {'id': 's6_payoff', 'in': S5_OUT, 'out': FB(51),
     'what': 'Payoff plate h2_class (src/footage/h2): card 1\'s slide comped on the projection screen BEHIND the '
             'presenter\'s hand (plate -> slide into quad_draw -> fg.png), slow 2.5D push-in, classmates from behind. '
             '«خلّ شغلك يسولف عنك.» lands on the wide chord (f719) and holds ~1 s after its last word (fix round: the '
             'scene runs to beat 51, one beat longer). Samples label still on.'},
    {'id': 's7_end', 'in': FB(51), 'out': END_F,
     'what': 'End card on ink: wordmark «طشّ» + «للطلاب» + «شغل يبيّض الوجه.» on the cut; CTA (f784) and the two '
             'handles (f791) hold to the end; «بس مو آخر ليلة.» pops with the voice (f820); the TASH sonic logo plays '
             'alone after the last word (ticks from f854), its hit on f863 (the music\'s bar line: one beat was inserted '
             'at the payoff chord, see music_insert); the wordmark dots answer it.'},
]
SC = {s['id']: s for s in SCENES}


def ev(id_, text, scene, land, out, in_=None, words=None, kind='line', size='big', note=None, dir_='rtl', vo=None):
    e = {'id': id_, 'text': text, 'scene': scene, 'kind': kind, 'size': size, 'dir': dir_,
         'in': land - 4 if in_ is None else in_, 'land': land, 'out': out,
         't_in': T(land - 4 if in_ is None else in_), 't_land': T(land), 't_out': T(out)}
    if words: e['words'] = [{'text': w, 'land': f, 't': T(f)} for w, f in words]
    if vo: e['vo'] = vo
    if note: e['note'] = note
    return e


TEXT = []
s1o = SC['s1_hook']['out']
# ---- s1: the three questions accumulate (one line each, in reading order), all leave with the push into the screen
TEXT.append(ev('L1.1', on('L1', 0), 's1_hook', FB(-2), s1o, in_=2,
               words=[[on('L1', 0).split(' ')[0], F(V['phrases'][0]['film_on'] + 0.02)], [on('L1', 0).split(' ')[1], FB(-2)]],
               vo='h1', note='«عندك» lands with the first VO frame, «برزنتيشن؟» on beat -2 (the stress); the line stays up '
                             'with the next two (they stack) until the push leaves them behind'))
TEXT.append(ev('L1.2', on('L1', 1), 's1_hook', FB(0), s1o, vo='h2', note='bar line 1'))
TEXT.append(ev('L1.3', on('L1', 2), 's1_hook', Q3, s1o, vo='h3',
               note='(fix round 2) lands on f62 with its hit, ~20 ms before its VO word; sharp to f73'))
# ---- s2
bub = FB(7)                                                          # the TASH bubble lands (s3)
TEXT.append(ev('L2', on('L2', 0), 's2_screen', FB(3.5), bub, words=word_lands(on('L2', 0), ['d1'], FB(3.5)), vo='d1',
               note='the only big line inside the screen; leaves as the TASH bubble arrives'))
TEXT.append(ev('ui.file', ui('app_file_name'), 's2_screen', FB(2.5) + 2, FB(12), in_=FB(2.5), kind='ui', size='small'))
TEXT.append(ev('ui.placeholder', ui('placeholder_title'), 's2_screen', FB(2.5) + 2, FB(12), in_=FB(2.5), kind='ui', size='small',
               note='low contrast, texture only'))
TEXT.append(ev('ui.clock', ui('clock'), 's2_screen', FB(2.5) + 2, FB(12), in_=FB(2.5), kind='ui', size='small'))
# (fix round) s2 opens with a match cut on the slide's white and whips back to the app (settled ~f87): the group chat
# pops once its bubble is inside the safe area (f81-83), still before the reminder drops with the ding (f83-85)
TEXT.append(ev('ui.group_chat', ui('group_chat_bubble'), 's2_screen', FB(2.5) + 5, FB(12), in_=FB(2.5) + 4, kind='ui', size='small',
               note='lands FIRST (no group header) and stays to the splash'))
TEXT.append(ev('ui.notif_title', ui('deadline_notification_title'), 's2_screen', FB(3), FB(12), in_=FB(3) - 2, kind='ui', size='small',
               note='with the ding (beat 3); the pin is a drawn icon, no emoji'))
TEXT.append(ev('ui.notif', ui('deadline_notification'), 's2_screen', FB(3), FB(12), in_=FB(3) - 2, kind='ui', size='small'))
# ---- s3
s3o = SC['s3_splash']['out']
TEXT.append(ev('ui.tash_sender', ui('tash_bubble_sender'), 's3_splash', bub, FB(12), in_=bub - 3, kind='ui', size='small',
               note='the bubble\'s sender name; no time, no online dot'))
TEXT.append(ev('ui.tash_typing', ui('tash_bubble_typing'), 's3_splash', bub, FB(7.5) - 3, in_=bub - 2, kind='ui', size='small',
               note='typing dots until «المرة الجاية…» replaces them (fix round 2: gone one frame before its first word shows; '
                    'they come back on row 2 from «الجاية…» to «خلّ», then on row 3 as the wordmark\'s dots)'))
TEXT.append(ev('L3.1', on('L3', 0), 's3_splash', FB(7.5), s3o, words=word_lands(on('L3', 0), ['t1'], FB(7.5)), vo='t1',
               note='typed into the TASH bubble (the bubble text IS the on-screen text); stays to the cut f258'))
pre = ui('tash_bubble_before_splash')                               # «خلّ التصميم على •••»
t2w = vo_words(['t2'])
TEXT.append(ev('L3.2a', pre, 's3_splash', F(t2w[0][2] + 0.02), FB(12),
               words=[[t2w[i][0], F(t2w[i][2] + 0.02)] for i in range(3)] + [[pre.split(' ')[-1], F(t2w[2][2] + 0.02) + 3]],
               vo='t2', note='the second bubble line typed word by word; its trailing typing dots stay live until the hit'))
TEXT.append(ev('L3.2', on('L3', 1), 's3_splash', FB(12), s3o, in_=FB(12),
               note='on the hit (bar line, f215) the dots burst into the splash and land as the wordmark «طشّ»: the line now '
                    'reads «خلّ التصميم على طشّ.» with the wordmark as its last word (one element, no second copy)'))
TEXT.append(ev('L3.3', on('L3', 2), 's3_splash', FB(13), s3o, note='snaps under the wordmark (lock-up «طشّ للطلاب»)'))
# ---- s4 parade
CARDS = [
    (1, 'presentation', 'P1', 0, 1, 15, 17, 'slides fan out',
     'HERO = samples/deck-uni-01-title.png (the slide the splash reveals, card 1, and the one on the lecture-hall screen); '
     'fan: deck-uni-02-problem, deck-uni-03-data, deck-uni-04-thanks, deck-school-01-title/02-cycle/03-quiz'),
    (2, 'report', 'P2', 0, 1, 20, None, 'cover + pages flip', 'samples/report-01-cover.png, report-02-contents.png, report-03-chart.png'),
    (3, 'research', 'P3', 0, 1, 22.5, None, 'formatted paper: headings, numbering, references', 'samples/research-01-first.png, research-02-refs.png'),
    (4, 'poster', 'P4', 0, None, 26, None, 'one hit', 'samples/poster-recycle.png (infographic-tips.png spare)'),
    (5, 'video', 'P4', 1, None, 27, None, 'frame + timeline', 'samples/video-frame.png'),
    (6, 'cv', 'P4', 2, None, 28.5, None, 'one hit', 'samples/cv-student.png'),
    (7, 'excel', 'P5', None, 0, 30.5, None, 'dashboard, the chart draws', 'samples/sheet-dashboard.png'),
]
PH = {'P1': ['p1a', 'p1b'], 'P2': ['p2a', 'p2b'], 'P3': ['p3a', 'p3b'], 'P4': ['p4a', 'p4b', 'p4c'], 'P5': ['p5']}
starts = [FB(c[5]) for c in CARDS] + [FB(33)]
SLOTS = []
for i, (n, kind, lid, chip_i, ans_i, beat, _, move, hint) in enumerate(CARDS):
    land = FB(beat)
    nxt = starts[i + 1]
    slot = {'card': n, 'kind': kind, 'answers': lid, 'hook_question': {1: 'L1.1', 2: 'L1.2', 3: 'L1.3'}.get(n), 'in': land - 3,
            'land': land, 'out': FB(33), 'hero_until': nxt, 't_land': T(land), 'move': move, 'sample_hint': hint}
    if chip_i is not None:
        slot['chip'] = on(lid, chip_i)
        ph = [PH[lid][chip_i]] if lid == 'P4' else [PH[lid][0]]
        TEXT.append(ev(f'{lid}.chip' if lid != 'P4' else f'P4.{chip_i + 1}', on(lid, chip_i), 's4_parade', land, nxt,
                       kind='chip', size='mid', vo=ph[0], note=f'card {n} chip (= its on-screen word, rendered once)'))
    else:
        slot['chip'] = ui('sample_chip')
        TEXT.append(ev('ui.chip_excel', ui('sample_chip'), 's4_parade', land, FB(33), kind='chip', size='mid', note='card 7 chip'))
    if ans_i is not None and lid in ('P1', 'P2', 'P3'):
        a_ph = PH[lid][1]; a_on = next(p for p in V['phrases'] if p['id'] == a_ph)
        a_land = FB(17) if lid == 'P1' else F(a_on['film_on'] + 0.02)
        TEXT.append(ev(f'{lid}.answer', on(lid, 1), 's4_parade', a_land, nxt, words=word_lands(on(lid, 1), [a_ph], a_land),
                       vo=a_ph, note=f'the answer punches in beside card {n}\'s chip; (fix round 2) it holds until the next '
                                     'answer replaces it, dimmed to 70 % once the next card lands'))
    SLOTS.append(slot)
TEXT.append(ev('P5', on('P5', 0), 's4_parade', FB(30.5), FB(33), words=word_lands(on('P5', 0), ['p5'], FB(30.5)), vo='p5'))
# (fix round 2) every answer is complete on screen for >= 1 s: it holds until the next answer replaces it (the answers share
# one spot), dimmed to 70 % under the next card; «ننسّقه عدل.» rides under the poster to f437 (its last word lands f403)
_ans = {e['id']: e for e in TEXT if e['id'].endswith('.answer')}
_ans['P1.answer']['out'] = _ans['P2.answer']['land'] - 1        # a clean swap: the next answer punches in on the
_ans['P2.answer']['out'] = _ans['P3.answer']['land'] - 1        # frame this one is cut (never two answers at once)
_ans['P3.answer']['out'] = _ans['P3.answer']['words'][-1]['land'] + 35
for _e in _ans.values(): _e['t_out'] = T(_e['out'])
for j, (tag, k) in enumerate(zip(uis('research_card_tag'), (24, 24.25, 24.5))):
    TEXT.append(ev(f'ui.research_tag{j + 1}', tag, 's4_parade', FB(k), FB(26), kind='tag', size='small',
                   note='on card 3: what we did to the paper'))
for j, (chip, k) in enumerate(zip(uis('file_chip'), (31, 31.25, 31.5, 31.75, 32))):
    TEXT.append(ev(f'ui.file_chip{j + 1}', chip, 's4_parade', FB(k), FB(33), in_=FB(k) - 2, kind='file_chip', size='small',
                   dir_='ltr', note='LTR element (dir=ltr), the dot on the left; pops on quarter beats, then the fan holds'))
# ---- s5 details
m1w = vo_words(['m1'])
TEXT.append(ev('D1.1', on('D1', 0), 's5_details', FB(33.5), FB(38),
               words=[[on('D1', 0).split(' ')[0], FB(33.5)], [on('D1', 0).split(' ')[1], F(m1w[1][2] + 0.02)]], vo='m1',
               note='the margins line; the only label of the margins'))
TEXT.append(ev('D1.2', on('D1', 1), 's5_details', FB(35.5), FB(38), vo='m2',
               note='lands ON THE SNAP of the alignment guides (f553); (fix round 2) both D1 lines hold to the hard cut f589'))
# (fix round 2) the optional callouts («فهرس تلقائي», «ترقيم الصفحات») are not used: the script makes them conditional on
# 0.5 s of free time, and here that time is D1's own hold (and the callout hid the dots of «التنفيذي» on the page)
TEXT.append(ev('R1.1', on('R1', 0), 's5_details', FB(38), S5_OUT, words=word_lands(on('R1', 0), ['r1'], FB(38)), vo='r1',
               note='THE RULE LINE, part 1, on BEFORE'))
TEXT.append(ev('R1.2', on('R1', 1), 's5_details', FB(40.5), S5_OUT, words=word_lands(on('R1', 1), ['r2'], FB(40.5)), vo='r2',
               note='part 2, on AFTER, after the swipe on the bar line f618; both parts read together to the cut'))
ba = uis('before_after_label')
TEXT.append(ev('ui.before', ba[0], 's5_details', FB(38), FB(40), kind='label', size='small'))
TEXT.append(ev('ui.after', ba[1], 's5_details', FB(40) + 2, S5_OUT, in_=FB(40), kind='label', size='small'))
# ---- s6 payoff
TEXT.append(ev('C1.1', on('C1', 0), 's6_payoff', S5_OUT + 2, FB(51), in_=S5_OUT, words=word_lands(on('C1', 0), ['c1'], S5_OUT + 2),
               vo='c1', note='(fix round) the VO starts on the cut (22.86 s); the type lands 2 frames into the hall'))
TEXT.append(ev('C1.2', on('C1', 1), 's6_payoff', FB(47), FB(51), words=word_lands(on('C1', 1), ['c2'], FB(47)), vo='c2',
               note='lands on the wide chord; holds ~1 s after its last word'))
# ---- s7 end card (strings from script.json endcard, in order)
EC = S['endcard']
e1 = next(p for p in V['phrases'] if p['id'] == 'e1'); e2 = next(p for p in V['phrases'] if p['id'] == 'e2')
TEXT.append(ev('end.wordmark', EC[0], 's7_end', FB(51), END_F, in_=FB(51), kind='logo', note='the wordmark (logo, not typed text)'))
TEXT.append(ev('end.line', EC[1], 's7_end', FB(51) + 3, END_F, in_=FB(51)))
TEXT.append(ev('end.tagline', EC[2], 's7_end', FB(51) + 6, END_F, in_=FB(51) + 1, size='mid', note='first to go if the card is crowded'))
TEXT.append(ev('end.cta', EC[3], 's7_end', F(e1['film_on'] + 0.02), END_F, vo='e1', size='mid'))
TEXT.append(ev('end.ig', EC[4], 's7_end', FB(52), END_F, size='small', note='Arabic label + the handle as its own LTR run; U+200E before @'))
TEXT.append(ev('end.tt', EC[5], 's7_end', FB(52) + 2, END_F, size='small', note='same as end.ig'))
TEXT.append(ev('E2', EC[6], 's7_end', FB(54), END_F, words=word_lands(EC[6], ['e2'], FB(54)), vo='e2', size='mid',
               note='pops with the voice (its own beat); on a loop it runs straight into the hook'))
assert on('E2', 0) == EC[6] and on('E1', 0) == EC[3]

# the samples label: one global overlay (main.js owns it) from the first frame of the sample to the end of the payoff
# (lead, integration) it starts on card 1's first visible frame (the splash hit + 4 = f219), not on the hit itself:
# on f215-218 the splash is still washing the student's own screen, which is not a sample
LABEL = {'text': ui('samples_label'), 'in': CARD1_IN, 'out': FB(51), 't_in': T(CARD1_IN), 't_out': T(FB(51)),
         'note': 'drawn by main.js (kit.samplesLabel) on every frame from card 1\'s first visible frame (fix round: card 1 '
                 'now flies in as a new object from f%d, after the lock-up has read) to the end of the payoff (f%d), so it '
                 'never flickers at a cut; one opaque pill; a little larger for card 1\'s first 15 frames' % (CARD1_IN, FB(51))}
LABEL_POS = {'s3_splash': 'top', 's4_parade': 'top', 's5_details': 'top', 's6_payoff': 'top'}

# ---- SFX for the audio agent (frame = the hit; times in seconds too)
TXT_ID = {e['id']: e for e in TEXT}
def sfx(name, f, note): return {'name': name, 'frame': f, 't': T(f), 'beat': round((T(f) - PHASE) / BEAT, 2), 'note': note}
SFX = [
    sfx('hook_bed', 0, 'night room tone + low tension pad, pre-drop (no groove yet); laptop fan hum'),
    sfx('kbd_taps', 3, 'a few hesitant keyboard taps under «عندك…» (f3-f40), then stop: the student gives up'),
    sfx('hook_hit_1', FB(-2), '«برزنتيشن؟» punch-in: dry percussive tick + sub tap'),
    sfx('hook_hit_2', FB(0), '«تقرير؟» punch-in (bar line 1)'),
    sfx('hook_hit_3', Q3, '«بحث؟» punch-in (fix round: with the type, ~0.2 s before the word)'),
    sfx('push_whoosh', FB(1.5) + 2, 'the camera dives into the laptop screen: rising whoosh f66-f77, cut dead on the white (f78)'),
    sfx('screen_on', FB(2.5), 'white -> UI: soft digital blip'),
    sfx('chat_pop', FB(2.5) + 5, 'group-chat message received (short bubble pop)'),
    sfx('notif_ding', FB(3), 'deadline notification ding (beat 3); the VO enters 0.22 s later'),
    sfx('clock_ticks', FB(4), 'clock ticks on every beat f99-f210 (2:47 am), low in the mix, stop at the hit'),
    sfx('tash_bubble_pop', FB(7), 'the TASH bubble arrives (brand pop; its typing dots tick like the sonic logo ticks)'),
    sfx('typing', FB(7.5), 'soft typing under «المرة الجاية…» and «خلّ التصميم على…» (f150-f210)'),
    sfx('splash_riser', FB(10.5), 'riser f193 -> cut at the hit'),
    sfx('SPLASH', FB(12), 'THE «طشّ» HIT on the bar line: water splash + sub + riser cut; the groove drops here '
                          '(UK-garage / Jersey-club bounce, bright)'),
    sfx('lockup_snap', FB(13), '«للطلاب» snaps under the wordmark'),
    sfx('card1', FB(15), 'card 1 hit + slides fan out (paper whoosh)'),
    sfx('answer1', FB(17), 'answer pop (soft)'),
    sfx('deck_school', FB(17), '(fix round 2) the school deck grows out from behind card 1 (f287-f295): a short fan flick + three flicks'),
    sfx('card2', FB(20), 'card 2 hit (bar line)'),
    sfx('card2_turn1', TXT_ID['P2.answer']['land'] - 5, '(fix round 2) the report cover turns (vertical ~2 frames later): one paper flip'),
    sfx('card2_turn2', TXT_ID['P2.answer']['land'] + 10, '(fix round 2) the contents page turns: one paper flip'),
    sfx('answer2', F(next(p for p in V['phrases'] if p['id'] == 'p2b')['film_on'] + 0.02), 'answer pop'),
    sfx('card3', FB(22.5), 'card 3 hit + paper flip'),
    sfx('research_tags', FB(24), 'three small ticks f388 / f392 / f395 (the tags عناوين، ترقيم، مراجع)'),
    sfx('card4', FB(26), 'card 4 (poster): percussive hit + whoosh'),
    sfx('card5', FB(27), 'card 5 (video): hit + a shutter/click'),
    sfx('card6', FB(28.5), 'card 6 (CV): hit'),
    sfx('card7', FB(30.5), 'card 7 (Excel): hit + rising pluck as the chart draws'),
    sfx('file_chips', FB(31), 'five rising mouse-click pops on quarter beats f488-f503 (the file chips)'),
    sfx('fan_hold', FB(32), 'held chord on the full fan to the cut (f503-f517)'),
    sfx('details_in', FB(33), 'cut to the details: soft macro whoosh; music thins (filtered) for the details'),
    sfx('margin_snap', FB(35.5), 'the alignment guides SNAP on «نضبّطها» (click + tiny bell)'),
    sfx('breath_gap', FB(36.5) + 5, 'the VO breath before the rule line (19.21-19.58 s): keep the music low here'),
    sfx('rule_line', FB(38), 'THE RULE LINE in: music drops back to the beat, nothing busy under the voice'),
    sfx('ba_swipe', FB(40), 'before/after swipe (whoosh) on the bar line'),
    sfx('class_cut', S5_OUT, 'cut to the lecture hall: room air, a soft low swell (the VO «ويوم…» starts on the cut)'),
    sfx('wide_chord', FB(47), 'the WIDE CHORD under «خلّ شغلك يسولف عنك.» (pride, warm)'),
    sfx('end_cut', FB(51), 'cut to the end card: clean hit (music: logical bar line 50 = film beat 51)'),
    sfx('cta_pop', F(e1['film_on'] + 0.02), 'CTA pop'),
    sfx('handles_pop', FB(52), 'handles pop (two light ticks)'),
    sfx('tag_pop', F(e2['film_on'] - 0.21), '«بس مو آخر ليلة.» wink pluck, its attack in the gap BEFORE «بس» (fix round)'),
    sfx('sonic_logo_ticks', F(V['vo_last_end'] + 0.02), 'TASH sonic logo typing ticks start AFTER the last word (fix round: '
                                                       'three ticks 0.09 s apart from vo_last_end + 0.02)'),
    sfx('sonic_logo_hit', FB(57), 'TASH sonic logo hit on the music\'s bar line (logical 56 = film beat 57); alone after the '
                                  'voice; tail to the end'),
]

beats = [{'k': k, 't': B(k), 'f': FB(k), 'bar': k % 4 == 0} for k in range(-2, 59) if 0 <= B(k) <= END_F / FPS + 1e-6]

C = {
    '_note': __doc__.strip(),
    'fps': FPS, 'width': 1080, 'height': 1920,
    'duration_frames': END_F, 'duration': T(END_F),
    'bpm': BPM, 'beat': BEAT, 'phase': PHASE, 'bar': round(4 * BEAT, 4),
    'grid_rule': 'beat k at phase + k*beat s; frame round(t*30); k % 4 == 0 = bar line. The VO key words lead their grid '
                 'point by 0.02 s; type lands ON the grid frame.',
    'vo': {'file': 'src/vo/vo_edit.wav', 'timeline': 'src/vo/vo_timeline.json', 'tempo': V['tempo'],
           'first_onset': V['vo_first_onset'], 'last_end': V['vo_last_end'], 'length': V['vo_edit_length']},
    'safe': {'x0': 64, 'x1': 1016, 'y0': 250, 'y1': 1620},
    'scenes': SCENES,
    'handoffs': {
        's1_s2': {'frame': FB(2.5), 'what': 'white match: s1 ends on a fully white frame (inside the laptop screen); s2 starts '
                                            'from white and the app UI resolves out of it within ~6 frames'},
        's3_s4': {'frame': FB(15), 'card1': 'scenes/s4_parade.js HANDOFF + card1Matrix()',
                  'what': '(fix round) card 1 flies in as a new object in s3 (from f%d) and sits on f257 exactly where the '
                          'parade camera sees it on f258: centred about (540, 1300), 760 px wide, rolled -3 deg; s4\'s camera '
                          'then lifts it to the spot' % CARD1_IN},
        's4_s5': {'frame': FB(33), 'what': 'hard cut on the beat (or s5 opens with a push into one page)'},
        's5_s6': {'frame': S5_OUT, 'what': 'match cut to the lecture hall; the slide on its screen is card 1\'s slide'},
        's6_s7': {'frame': FB(51), 'what': 'hard cut to the end card'},
    },
    'text': sorted(TEXT, key=lambda e: (e['in'], e['id'])),
    'cards': SLOTS,
    'samples_label': LABEL, 'label_pos': LABEL_POS,
    'sfx': SFX,
    'beats': beats,
    'music_insert': {'from_logical_beat': 48, 'beats': 1,
                     'note': 'fix round: one beat was inserted after the payoff chord (beat 47) so the closing line holds '
                             '~1 s; the music\'s logical beat k >= 48 sounds at film beat k + 1 (audio.py kt/i16)'},
    'key': {'hook1': FB(-2), 'hook2': FB(0), 'hook3': FB(1.5), 'q3': Q3, 'whiteout': FB(2.5) - 1, 'ding': FB(3), 'bubble': FB(7),
            'splash': FB(12), 'lockup': FB(13), 'card1_in': CARD1_IN, 'card1': FB(15), 'card2': FB(20), 'card3': FB(22.5), 'card4': FB(26),
            'card5': FB(27), 'card6': FB(28.5), 'card7': FB(30.5), 'fan': FB(32), 'details': FB(33), 'snap': FB(35.5),
            'rule': FB(38), 'swipe': FB(40), 'rule2': FB(40.5), 'payoff_cut': S5_OUT, 'payoff': S5_OUT + 2, 'chord': FB(47),
            'deck_school': FB(17), 'card2_turn1': TXT_ID['P2.answer']['land'] - 5, 'card2_turn2': TXT_ID['P2.answer']['land'] + 10,
            'end': FB(51), 'cta': F(e1['film_on'] + 0.02), 'handles': FB(52), 'tag': FB(54), 'logo_hit': FB(57),
            'logo_ticks': F(V['vo_last_end'] + 0.02), 'last': END_F - 1},
}
# sanity: every on-screen string of script.json is used exactly as written
used = {e['text'] for e in TEXT}
for l in S['lines']:
    for s in l['onscreen']:
        assert s in used, ('missing', l['id'], s)
for s in EC: assert s in used, s
json.dump(C, open(os.path.join(SRC, 'cues.json'), 'w'), ensure_ascii=False, indent=1)
print(f"cues.json: {T(END_F)} s ({END_F} frames) @ {BPM} BPM, phase {PHASE}; {len(TEXT)} text events, {len(SFX)} sfx")
for s in SCENES: print(f"  {s['id']:11s} f{s['in']:4d}-f{s['out']:4d}  ({T(s['in']):6.3f}-{T(s['out']):6.3f} s)")
