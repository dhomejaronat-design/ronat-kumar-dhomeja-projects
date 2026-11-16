from state_analyzer import StateAnalyzer, ANGRY, HAPPY, NEUTRAL, SAD

BOX = (100, 100, 50, 50)


def feed(sa, emotions, eyes=2, box=BOX):
    for e in emotions:
        sa.update(e, box, eyes)


def test_no_eyes_for_15_frames_is_drowsy():
    sa = StateAnalyzer()
    feed(sa, [NEUTRAL] * 15, eyes=0)
    assert sa.get_state()[0] == "DROWSY"


def test_14_frames_without_eyes_is_not_drowsy():
    sa = StateAnalyzer()
    feed(sa, [NEUTRAL] * 14, eyes=0)
    assert sa.get_state()[0] != "DROWSY"


def test_mostly_negative_is_distressed():
    sa = StateAnalyzer()
    feed(sa, [SAD] * 7 + [ANGRY] * 2 + [HAPPY])
    assert sa.get_state()[0] == "DISTRESSED"


def test_changing_emotions_is_expressive():
    sa = StateAnalyzer()
    feed(sa, [HAPPY, NEUTRAL] * 5)
    assert sa.get_state()[0] == "EXPRESSIVE"


def test_still_and_neutral_is_focused():
    sa = StateAnalyzer()
    feed(sa, [NEUTRAL] * 10)
    state, info = sa.get_state()
    assert state == "FOCUSED"
    assert info["movement"] == 0


def test_moving_and_happy_is_active():
    sa = StateAnalyzer()
    for i in range(10):
        sa.update(HAPPY, (100 + i * 20, 100, 50, 50), 2)
    assert sa.get_state()[0] == "ACTIVE"
