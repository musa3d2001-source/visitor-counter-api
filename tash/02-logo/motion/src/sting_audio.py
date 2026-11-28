import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../_system/audio'))
from tashaudio import *
m = Mix(4.2, tail=0.3)
m.add(sonic_logo(), 0.0)
m.master(os.path.join(os.path.dirname(__file__), '../../../review/sting/sting.wav'), glue=False)
