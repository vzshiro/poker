# Complete Rules Explanation
## General Practice
1. The game follows general Texas Hold'em rules.
2. The game is played as **No Limit** and no raise limit as well (Can have more than 10 raise in a single stage).
3. Unfortunately, split pots are not implemented yet.
4. Kicker applies to hands without sets, similarly described [here](https://howtoplaypokerinfo.com/kicker).

## Stages
### Flow
1. Preflop
    - (All players are dealt 1 card in selected sequence) x 2
2. Flop
    - (1 card is dealt to the table and 1 card is burned) x 3
3. Turn
    - 1 card is dealt to the table and 1 card is burned
4. River
    - 1 card is dealt to the table and 1 card is burned
5. Showdown
    - Every players' (except those who folded) hands are shown to all players (include those who folded)

### Notes
1. If all players except 1 folds before the end of River stage, the last player wins automatically (No hands are showed).

## Hand Rankings
Before you start reading, you need to understand that every player only competes with their 5 best cards.

*Suit is never considered during kicker*

*When tie is not specified, it means there are multiple winners and they split the pot.*
1. Royal Flush (10, J, Q, K, A - Same Suit)
    - Tie only happens when the flush is on the board
2. Straight Flush (9, 10, J, Q, K - Same Suit)
    - If tie happens, highest straight wins (K wins Q)
    - Suit does not matter
3. Four of a Kind (7, 7, 7, 7, K)
    - If tie happens, kicker decides (highest card)
4. Full House (K, K, K, 8, 8)
    - If tie happens, the hand with higher 3 of a Kind wins
5. Flush (A, K, 2, 7, Q - Same Suit)
    - If tie happens, apply rules similarly to kicker (highest card)
6. Straight (A, 2, 3, 4, 5)
    - If tie happens, highest card in straight wins
    - In the case of (A, 2, 3, 4, 5), highest card is **5**; while (10, J, Q, K, A), highest card is **A**
7. Three of a Kind (8, 8, 8, 9, K)
    - If tie happens, kicker decides (highest card)
8. Two Pair (K, K, A, A, 10)
    - If tie happens, kicker decides (highest card)
9. One Pair (10, 10, 6, 5, 2)
    - If tie happens, kicker decides (highest card)
10. High Card (K, A, 2, 6, 9)
    - If tie happens, kicker decides (highest card)