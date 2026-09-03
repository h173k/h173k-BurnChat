/**
 * Burn-goal accounting.
 *
 * Kept out of the component as a pure function: this is the one piece of the
 * app where a subtle mistake is invisible until a live stream has been running
 * for an hour, so it needs to be testable on its own.
 *
 * The rules it enforces, all of which existed for the single goal and now have
 * to hold for several at once:
 *
 *  - A burn is examined exactly once, ever. `seen` is shared by every goal, so
 *    re-fetched messages can never be counted twice.
 *  - Messages are marked as seen even while everything is frozen. That is the
 *    whole point of doing it unconditionally: pausing a goal and resuming it
 *    later must not back-fill the burns that landed in between.
 *  - A goal starts counting from the moment it exists. Whatever is already on
 *    screen is part of the baseline, not part of the total.
 *  - Each goal applies its own keyword filter, which is what lets two goals
 *    run side by side and collect different burns from the same chat.
 */
import { capList, makeGoalState } from './constants'
import { parseGoalKeywords, messageMatchesGoal } from './utils'

/**
 * @param prev     persisted progress: { seen: string[], goals: Record<id, state> }
 * @param goals    the configured goals, in settings order
 * @param messages every message currently known (chain + optimistic local)
 * @param enabled  master switch; off freezes all goals without hiding progress
 * @returns { next, popups, changed } — `next` is safe to persist as-is,
 *          `popups` lists goals that just crossed their target.
 */
export function accumulateGoals(prev, goals, messages, enabled) {
  const seen = new Set(prev?.seen || [])
  const nextGoals = { ...(prev?.goals || {}) }
  const list = Array.isArray(goals) ? goals : []
  let changed = false

  // Progress belonging to deleted goals is dropped, so removing a goal and
  // creating a new one is a genuinely clean start rather than a resurrection.
  for (const id of Object.keys(nextGoals)) {
    if (!list.some(g => g.id === id)) { delete nextGoals[id]; changed = true }
  }

  // Work out what is new ONCE, for all goals.
  const fresh = []
  for (const m of messages || []) {
    if (!m || !m.signature) continue
    if (!seen.has(m.signature)) { seen.add(m.signature); fresh.push(m); changed = true }
  }

  const popups = []
  for (const g of list) {
    // A switched-off master toggle and an individually paused goal both freeze
    // the total; the difference is only whether the bar is drawn.
    const frozen = !enabled || !!g.paused
    const target = Number(g.target) || 0
    let st = nextGoals[g.id]

    if (!st || !st.started) {
      st = { ...makeGoalState(target), started: true }
      changed = true
    } else {
      if (!frozen && fresh.length) {
        const keywords = parseGoalKeywords(g.keywords)
        let add = 0
        for (const m of fresh) {
          if (m.amount > 0 && messageMatchesGoal(m, keywords)) add += m.amount
        }
        if (add > 0) { st = { ...st, burned: st.burned + add }; changed = true }
      }
      // Changing the target arms the celebration again for the new number.
      if (target !== st.lastTarget) {
        st = { ...st, lastTarget: target, reached: false }
        changed = true
      }
    }

    if (!frozen && target > 0 && st.burned >= target && !st.reached) {
      st = { ...st, reached: true }
      changed = true
      popups.push({ goalId: g.id, title: g.title, text: g.text, burned: st.burned })
    }
    nextGoals[g.id] = st
  }

  return {
    next: { seen: capList([...seen]), goals: nextGoals },
    popups,
    changed,
  }
}

/**
 * Restart one goal's count. Dropping the entry makes the next accumulate pass
 * re-baseline it; `seen` is deliberately left alone, so the burns already on
 * screen stay excluded and only genuinely new ones count.
 */
export function resetOneGoal(prev, goalId) {
  const goals = { ...(prev?.goals || {}) }
  delete goals[goalId]
  return { seen: prev?.seen || [], goals }
}
