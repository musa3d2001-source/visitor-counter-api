"""«طشّ للطلاب» VO edit: the measured cut list of take1.mp3 (the one source of truth for tools/vo_edit.py).

Every boundary below was measured on take1 decoded to 48 kHz (10 ms RMS envelope, dB re. the loudest 10 ms, plus the
spectral centroid to tell a fricative tail from a breath or room rumble), NOT taken from take1.words.json: that
alignment runs up to 0.36 s off the audio (the second «بحث؟» is aligned at 12.51; it is spoken at 12.15).
 - The TTS leaves digital silence (~ -80 dB) between sentences; inside a sentence the pauses sit at -40..-57 dB
   (decay + low rumble, centroid 0.1-0.3 kHz) and are cut at their quietest point with fades.
 - Fricative ends are kept whole: the hook «بحث؟» ends with a 5-10 kHz ث that runs to 2.80 s at -50 dB, the parade
   «بحث؟» to 12.66; «بالخاص…» ends in a 6 kHz ص to 26.74; «عنّك.» releases to 25.48.
 - The one real inhale of the take (17.14-17.545, centroid 3.2 kHz, unvoiced) sits before «حتى الهوامش» in the read;
   the edit moves it into the breath before the rule line.
Accuracy: 'src_in', 'src_out' and 'on' (the first word's acoustic onset) are measured to about ±10 ms. The starts of
the inner words are the aligner's times re-anchored to the measured phrase onset and checked against envelope dips:
about ±60 ms (good enough for word-by-word type; the beat-critical words are all phrase onsets, plus «طشّ» 7.310,
measured on its ط burst).
Words are spelled as script.json's `vo` lines (checked byte for byte), not the TTS spelling («باچر» → «باجر», «سي في» →
«سي ڤي»); on screen «سي ڤي» is «CV»."""

# id, script line, src_in, src_out (cut points incl. a 30-60 ms natural tail), on, words [(text, src_start)]
PIECES = [
    ('h1', 'L1', 0.012, 1.220, 0.023, [('عندك', 0.023), ('برزنتيشن؟', 0.370)]),
    ('h2', 'L1', 1.405, 1.955, 1.420, [('تقرير؟', 1.420)]),
    ('h3', 'L1', 2.150, 2.830, 2.170, [('بحث؟', 2.170)]),
    ('d1', 'L2', 3.200, 4.880, 3.225, [('والتسليم…', 3.225), ('باجر؟', 4.108)]),
    ('t1', 'L3', 5.235, 6.170, 5.257, [('المرة', 5.257), ('الجاية…', 5.600)]),
    ('t2', 'L3', 6.170, 7.790, 6.235, [('خلّ', 6.235), ('التصميم', 6.440), ('على', 6.910), ('طشّ.', 7.310)]),
    ('p1a', 'P1', 8.020, 8.870, 8.039, [('برزنتيشن؟', 8.039)]),
    ('p1b', 'P1', 9.045, 10.420, 9.070, [('يشدّ', 9.070), ('من', 9.390), ('أول', 9.630), ('سلايد.', 10.050)]),
    ('p2a', 'P2', 10.665, 11.220, 10.680, [('تقرير؟', 10.680)]),
    ('p2b', 'P2', 11.325, 11.950, 11.340, [('نرتّبه.', 11.340)]),
    ('p3a', 'P3', 12.135, 12.690, 12.150, [('بحث؟', 12.150)]),
    ('p3b', 'P3', 12.825, 13.820, 12.840, [('ننسّقه', 12.840), ('عدل.', 13.590)]),
    ('p4a', 'P4', 14.125, 14.655, 14.141, [('بوستر.', 14.141)]),
    ('p4b', 'P4', 14.712, 15.320, 14.725, [('فيديو.', 14.725)]),
    ('p4c', 'P4', 15.320, 16.130, 15.330, [('سي', 15.330), ('ڤي.', 15.660)]),
    ('p5', 'P5', 16.165, 17.120, 16.180, [('وأي', 16.180), ('ملف', 16.400), ('أوفيس.', 16.700)]),
    ('m1', 'D1', 17.545, 18.500, 17.557, [('حتى', 17.557), ('الهوامش…', 17.770)]),
    ('m2', 'D1', 18.500, 19.200, 18.519, [('نضبّطها.', 18.519)]),
    ('r1', 'R1', 19.625, 20.700, 19.645, [('المعلومة', 19.645), ('منك…', 20.250)]),
    ('r2', 'R1', 20.700, 22.580, 20.725, [('والترتيب', 20.725), ('والتصميم', 21.500), ('علينا.', 22.000)]),
    ('c1', 'C1', 22.835, 23.850, 22.855, [('ويوم', 22.855), ('التسليم…', 23.180)]),
    ('c2', 'C1', 23.850, 25.490, 23.905, [('خلّ', 23.905), ('شغلك', 24.200), ('يسولف', 24.580), ('عنك.', 24.950)]),
    ('e1', 'E1', 25.775, 26.790, 25.790, [('دزّ', 25.790), ('لنا', 25.990), ('بالخاص…', 26.200)]),
    ('e2', 'E2', 26.985, 28.230, 27.003, [('بس', 27.003), ('مو', 27.250), ('آخر', 27.400), ('ليلة.', 27.800)]),
]
# pieces that continue the previous one without a real pause in the read (cut inside a -40..-57 dB dip): short
# crossfade-style fades at the joint instead of the 30-60 ms tail fade
# (fix round, 26 Nov) 'p4c' is no longer joined: at src 15.320 the take sits at -36..-39 dB for only ~20 ms inside
# running speech (not a -40..-57 dB dip), and the 12 ms joint fade clipped the voiced «و» of «فيديو.». p4b now gets the
# normal 35 ms tail fade and p4c a normal fade-in, with air between them (vo_edit RULES).
JOINED = {'t2', 'p4b', 'm2', 'r2', 'c2'}
BREATH = (17.140, 17.545)          # the take's one inhale (moved before the rule line)
