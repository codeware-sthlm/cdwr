import { OPEN_STATES, type StatusType } from '../linear';

export const STATES = OPEN_STATES;

export const isClosed = (statusType: StatusType): boolean =>
  statusType === 'completed' || statusType === 'canceled';

/** The Agent labels a ticket can carry; the state is the part after `agent:` */
export const AGENT: readonly string[] = [
  'agent:needs-input',
  'agent:working',
  'agent:ready',
  'agent:review'
];

/** Labels of tickets that belong to other repos and stay off the page */
export const OTHER_REPOS: readonly string[] = ['nx-plugins', 'enjinex'];

export const LINEAR_ISSUE = 'https://linear.app/codeware/issue/';

export const ROLES = ['planning', 'orchestrating', 'implementing'] as const;
export type Role = (typeof ROLES)[number];

export const STALE_HOURS = 2; // a scheduler silent this long is a problem
export const STUCK_MIN = 5; // a session polling this long while the queue has work for it missed the wake
export const INSTALL_MINUTES = 10; // what cdwr agent install writes (RUN_INTERVAL_SECONDS 600), assumed until the Job line says
export const LIMIT = 5; // the default limit of open agent PRs, used until the queue view says
export const SHIP_DAYS = 30; // agent tickets closed per day over this many days, the one trend on the page

/** Status first (In Progress, Todo, Backlog, Triage), then priority, then oldest */
export const STATUS_RANK: ReadonlyMap<string, number> = new Map([
  ['started', 0],
  ['unstarted', 1],
  ['backlog', 2],
  ['triage', 3]
]);

const WAIT: ReadonlyMap<string, string> = new Map([
  ['ci', 'CI'],
  ['copilot', 'Copilot review']
]);

/** What a parked ticket waits on, by name; undefined for a wait the page does not list */
export const waitName = (wait: string | undefined): string | undefined =>
  wait === undefined ? undefined : WAIT.get(wait);

/** Error codes that mean what is shown can no longer be trusted, so the source's data is dropped */
export const RETRACT: readonly string[] = [
  'unauthorized',
  'bad_response',
  'needs_reauth',
  'server_not_connected',
  'selection_required',
  'not_in_manifest',
  'consent_required',
  'blocked_by_policy',
  'approval_required'
];

/** The agent's avatar, inlined so it needs no request */
export const AGENT_AVATAR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAQAElEQVR4AexZCXhURbb+7+0tvSXdScgCQQgJAUGBgKIo4o7igguio09BcJ5Pnzo+/GYc9RvxuX7oPJVxGGVcZnDBXZFBnGGAUUGURQhrwpqwhCRkIb13377bO1VN2nS6OwmbOh/c75576576z6lTp06dquoWS/oP1E9kEnGCXycdcIIHAE5GwMkIOME9cHIKnOAB8NMmQbezELmuUzj14O/eMBktP+qY/GhTQBAM6J0/GGcMuhpTxr+IJ+/+Go9MXYDfTv6U04P8PQ/P3LMCrHz1mAdQdspZcGf2PK4OOe4OMJusGFZ2OR6/cynunTgHEy+ajoGnjIbZYIOm6ikpx9kbo4fcjDvGz8JDk+ZjytUzkecuhiAce3OPvcZ241VeNg4P3/4Fbrr0CZiMNmi6nkCKqmD5+vfw1do3OS2rmIs99ZugamoCruyUc3D/ze/hrglvwGnv0a6Foy8eFwdkOQpw13V/wYQLp8dHWlGosxXv4k8fTcHmnV/ykVcUGUtWv4q/fzeL08IVM/HyJ1Px2KsX4Pl3bsDbX/wG+xqqOBaagKLcQZh20we4dORdR9/zQxqOuQOKC0fgvhvmolePQdB1AeGIH8sq3sZzb4/HF9/ORG3jFoSlIDSNooGmwCE7El6yEkGzdy8qa77GK59OwV8//xV2123gMiySxgydjFsvex4Wkz1B7kg+jqkDBhdfjEnjZsJksNKoadjfWIXZ86Zi0apZ8Iea4/bpvPMa71Ccmaag6xp21q7Ca3+7E4tXz0Yw5OFy/YtG4fYrZsFmyUojmZrdkXvMHNC/1yjccP4TgCZCVTUs3/A2Zn82hY9kx0ZjDkgfAR3xbd/L1s/BK/Mmw+M/QA7WUeAuw61jZ8JoyGiDHPb7mDggw+zEdef/L9qS3IIVz2LJ96+kMUag0HVwrK4DomhKg0vN9gYPYPb8yTSNAlxHfnZ/TDj/8dTgbnDFbmA6hRgNFvzyijdgEinL05z+bvN7qNixIElGEAy4ZPg9eGDiApT2OpePoAAjfnX9J7jl4hfgdvRKkknHCEs+vPTxBLT6GrieksKzMWbIlHTwTvlH7YAxp98Bp60ALKltqVmKJWv/lNSggUb5ypEP4syBN9HoZ3IswzNiTuiTfwb+45KX4LT2SJJNx4jIAcxdfD9CES9PtmeUTYT5CJLiYTlAgIg8VynKS6/FlWc9jEmX/hlnDriRRkFDmLL9ojUvItXFRnxw38s4Tqc13pShwOkSYctkU0DnfLslB1ec9VAq8bS81sB+rN76MZc3GWyYMPppwgpE3b+75QCz0Y6hxeNx37V/w+RLXsMlw+7HoN5jkZ9VRo3rnBav/QPCUW/KlkcNvI1j2M7P4TLAajNDoJaNRhHsm5VZXVHOEBiEw8sJKzbPQUPLDq6/KGcosmkXmdKINEwyI03NIfbpfa/Ef457F5cMnwaTwQ5awZIoKkvYXrv8kETiy2JyklHFXEYwaKBUQCGrJ5DJovF6UE5g0yFRQ9df32yZw+WZbeUl13Ut0A4htisnFE0UUtec/QwuHjqNdnMO8rAGWY5iY/VCfLzs1/hm8184T6Ml7/NVT0BWwwnybR8WmpexZU+DSK3Rsg6NLG1PAvGZHkZsKrTJdvddc2A1vAG2NGo4rc+VsFmyuytKkzoFtEdmKSZd9Ab65o2kkQLCUgDfVr2J1xfdhMUV/4c9TWtR6B7MOxKJBrGn8fsUWmIsX+gAJSofx0ohnTuNOaQ9SSHaPhxyyt6mdTHBw3hqmoyvN73C24AuIt/Vv9vS5PtEbJatF8aPfAY2cy4Zq6O+pQrvL7sHq7a9hZDkiYPzs07l9T7yvKJF4/zkgo5ttV9yrKLo8HsUqDKFvBpzRiSsIhxQeb0nUA9vqC5ZRTc4jZ7tXIdGerMdfbshEYMkOMAgmDCu/HfIMGaRMg2N3p345LsH4AnWxtCHnjnOfjAKGRxTue+fh7jpX+t2fQRFiXJ8yKeiqU5Ca1MUjfT2NMpQFeYQFRW7Pk2vJE2NQEnFIJogKxLXr9GULHANToNOZic44LLyR2lD0g8Ujag7uBkfrriXjqZyklReJmV/ncKWqMGzNam+I8MXrsc7X09FlBlJMhodkqQIiwCBt6URb83O97Fxz7yOoim/M0xZKC++Eb849zVMOn8uJl/wPn4x+vW4rlxnGVgkpxTuwIw7IMfRD73cw8mLOpo8uzB/zUM0/9UO8Nin296H4zQKt0bv9hizi6c/cgDvLp+K1TveooNRE5dX6YhctW8RPl05Dat3zulCA9DTPRRXj3gOt543FyNLpiLL2pui1QWTaCeycZ3MpgyjCzeOehXXj/wjSvLGdKqXO8AoWnDp6b8DSyAKndGXVb1E3kwe+TZNbPemaRoYXTH0SYwb+hRGlf4Xcp392yAp30GpGWur5+Kd5bfiz0vG4dWlV+GryhdwwFuZEt/GZCvS+QMf4O0UZJ0GASJvOyL50eCpxI76L7G9bilF7UYEIwd5HSjKchwluOi0h7icy3YKUl0iY2bbi2Ez5XEPbqtbjEZf+rB224rRNye2l2fezsscjJ6ucgzqNR7XDJ+Jkf1+CYHmJdPbOVHcg1HnKIclDzee9TpK8y+ODRAtxXUHN+Ef66fjzeU3Yv73D+BfW57Fl5W/x4J1D+Kdb27BZ8Tb27QGUjTE+9ST7Ltq2LNg/ezYmsgY5X1uA1+fKYFsrfsHY6UkF4Uc66TZQPt5Cn++lNGRTj8UDcwhg3teiwsGPEjyh7clJYGk22LMxHUjXoZZjLXHVqHP1/8WC4n2HWRLb2oHNtEALtr0GD5YeQd4RFC/TKIT44bMgN2cm9COmGFyIT/zdAobHftbN6I5kHpOM9yVQ14gR7Hw02Gx6cguMCGHKLvAjKwckcaTTQsdvd2jKEpGJzR0+B8Cxg5+ioLdcsi29fhw9VQ0+bd1W5WkeEnmdlTWLeQ6jIINVw39Q4K86Lb1pU6BA6qbvk6obP/RwzEAohAzxuoU4Mgy8WoKAP42moxw5Rq5HsY7u989hDfyuiN5lPe+DS5rX66vwbsFS6uepBVJSqnKIJjRJ/tcDCu6DQMLxsNhyY/jNF3FqurZ2Fw7j+syG5y4eODjEMCDH2KmpYjPExa+LYGdSHcVuc6K4ywZIlfGkmB7Eg0CTBkqxxlghdNSmE5dp3w2xUpzx3I9gUgzllROT9v5AXlX47phb2B0yYMYXHgDRvS+A9cMeRXn0bfDUoC2a0Ptu2j27+Q6C5zDKB+U8irRYcmnzmicJNnLmakebmsJx7AOC6JO5dRkyTBRXUyf2ehMpapL3sg+d8Mo0sGLcsv6vW9B1aMpZcqLpmB476kwiXRWISyzrY2KXKNw6YAZpMcKdilaBGt2vxa3rbzodsaGmGHI4V5hESATiHNTPCJRXxynUgLUaPeSilSZHMPqiXQ2F1Lo6owlwIBc26m8LV+4ATUHv0KqK8PoQv/cqzhOo85bydc9iigX5YkQRBoAat8sZuLC0sfj4s3BKlo2N3KZHOtAOMwFEHU6PGgaGU0UR6Yo7PeuJe/FcHJEo6RBIHqhAwW8chznl+oJdHi3UcyAQaBNDdlT51mXVvjCkqfiuSu7hxkOp5nbZDYakZNvgcGkcTtcGSW0xP/wS9Pmhg85n/W5h+M0iJJCI0uNMYYAA9Jdjf5NccHWJhnRKM31Q3JMllFrcxgSOYeV67wVkJQfDk/p9Hbk59oHgW3ImI7GwKaO1fzbJNpgM8V+hmMdNZhoS93OFhZ4Vochbq/Z4OBy7MEGhelmlGXpAzEUbeEhwaaAyWBnmJTUGqnB3tYVhNUQpU427ZfgbY0iFFDg84TRVBdGwEMRQqEn0e9139fOSqmnM6aZ9hc9HWdTGzE9Pml/SrggUOeoHWazKCZ2nnWMkU5eYPWMAAFtl6yG4vqtxjyI3sjeuKdsxsRNQptQ7K1hbd0f0eDfQHgNCs11X4uCloYovM06IuysT6MgyX6s2PM0JLX7oy8KZgzImYhxpa+jKPM80q9zOrdoOgrsZ8Sab/dUtDAUVeKYMB2lFUXlZdbxNoqGYzrYt9LuuE7cOJZFmuiT9pFHNE4F9jPbNZNc1HQF39U+jY0H5tDxMwSV/tzUaJelqSoUOu42BjZicfV9aI3sSBZOyxFwTq/pKHNP4DbE9MXsMQlOnFn4a/TNGpsgzezY0vgOx7OBaG2UyBaSoQHQKCGGgwq8LTKvZzaG5aa4vEDREG+D8GIgWgdJCZBXgJ7282AQLHFwukKN5+/4Z/Xd+NfuaVi29yF8uec3WLL7Xny3/2nIWjCdWEr+qdm3INPMllia+oSwuTTkFJqR4RCoU2xkgVOzJ8Fu/GFNJxiqPYsQjDZzu0N+DQ27I2jcF0HDngia6yXOV8kZK2tn0DIqMRFOosA2a+D1kuKHSEVsbX6fGBp9WFBoP4cDu3ooehgh5QC80d0IyLWQeMjrXYkl1AswkNPHUDbXIQgacguNcDqtMBoFZLnNcFN216gTLFTL3Dcj8dLx7f7H4I/Uku06RaBGCViFHNVo5HUoNEW2Nr+H5sjGBDGTmEl4jZOfol9ktQ2h1WAhrFFiKXZeBYOQwdjHnUQaDVE3c4ONFh2i2LbD1MlAHWbacYIcw+xymZKP2hG1BSvqH8W2gx/AT0suwzHa7/sGq+qfRLVvQVIf8q1n8PYYrjWynQadIFHNh52eedSohgwxHyXO64n7Y9wsg1MM0lwUhNhbo3IbUSKHSgmMfYuwpjRIpUis9s1HXWA52R9z3DbPe/BEdybhWU4pdlzDcSz8W6VtMQcwZE1gPsLyQR6Ove2Xw2ksZuzjSjodVFQ1yttkiYt1uD3JsgItauL1gWhtp7ZoJKiT8zjRuTQVuMA6ijps4fp2eD8ilErf7ZCbW2dD4ZkdKHc/AoexT7vaY1/UICMkN1Oy08F+Gm9tjNDoxOanLMtoqY/yOpVWmhr/F50awDquqjoYpQI6jf3Qz34T16dQHw+EV3IYzwG8RA+PXIVtvjfJCEpKNDfLXdORZx5FNcfv3uB5ERKd21mu8x5UULsrhPrdYdRVRxAOMmfo8Eo1aJbYDyDp7dApAthUYURDmwC0G4ow2HkvoBtpSilY0/IYFD22WiU4gEnVR77CrgDtl8nrUEUMsN+JUtvtMAsuVn3MSdKascU3C0G5npKTBoWyuET/Faj0H4KmqmiJbMB679N05JA7bVsnD2pkM6P2QLfxdAxxPgwT3Fx/bXAJgureOCTJAaymNrIQ2wN/pekQ4dGQbxqD4c5nkGc6jxzhJkhKMeIf2e1VtmGt91HsDn2GgFKLoLIfXnkHKv0vY3PghS47z1plOYCNPiPQzDYLOehjmYhB9ml04rNSPzQ0RFagOvwug8cpbU8OyMuw0vc/CCstJKxC0E0oyZiEEY7nMML+HIrM18AplkEg34KerNGjIR0q9kkLUOF/DOv807ExMAMtCjsNMhO7Jp1+1NTor3dGPu6m0wAAAS1JREFUQ2yPkp0z0NM8ltvOeDWhT7Aj/Do6XkxzR178W4eEiuAj2Bp6mZJVI83VIP25QXNHMyLfcCHKLP+N4dbfY4T1RaIXOA23Pk+8rmmENYY/Vu9C4+XctqgSpCwv8LJEZW90FyoCj6JOTp1EO3UA84ROmbpVrcDGyOPYIb1CihYjpDVA1oNEgSRiyaU7JOvJsseKF9YaUS8vxXZpFiqlGYjoDawrKalLB7RJ6YjCr21DvbIQVaS0MjIDu6Q3sDf6EWrleT857ZM/xW5pLrZGZvJO1ykLENCSN0Nt/Wl7d9sBbQJtbwV+BPUaeLQNOKiu/cmpVV0Hn15Fw9RMJmpE3buP2AHdU//zR510wM9/jI6vhScj4Pj69+ev/WQE/PzH6Pha+G8fAUfrnv8HAAD//4FT584AAAAGSURBVAMA/7w15k977xAAAAAASUVORK5CYII=';
