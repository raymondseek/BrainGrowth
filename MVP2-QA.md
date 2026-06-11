# Brain Growth MVP 2 QA Checklist

## Entry Points

- Left ribbon opens the central Brain Growth Dashboard.
- Command palette command `Open Brain Growth Mini Panel` opens the right-sidebar Mini Panel.
- Dashboard header Mini Panel icon opens the right-sidebar Mini Panel.
- Mini Panel `Open Dashboard` opens or reveals the central Dashboard.
- Plugin startup does not force-open the Mini Panel.

## Mini Panel

- Mini Panel title is `Brain Growth`.
- Mini Panel shows only `Notes`, `Words`, and `Tag Types`.
- Mini Panel does not show last updated time, range controls, growth summary, chart, or refresh button.
- Mini Panel keeps previous successful values visible during scans and failed scans.
- Changed Mini Panel numbers roll independently.
- Unchanged Mini Panel numbers do not animate.

## Shared Refresh

- Dashboard manual refresh updates Dashboard and Mini Panel from the same latest snapshot.
- Opening a Markdown file schedules a debounced refresh.
- Leaving a Markdown file schedules a debounced refresh.
- Opening or leaving a non-Markdown file does not schedule a refresh.
- Markdown create, modify, delete, and rename events schedule a debounced refresh.
- Rapid file events collapse into one final scan.

## Dashboard MVP 2 Animation

- Dashboard metric numbers animate when values change.
- Dashboard trend line draws in when the chart renders.
- Reduced-motion system preference disables nonessential animation.

## Scope Guard

- No external URL, iframe, data export, local server, Mini Panel chart, Mini Panel range filter, or Mini Panel refresh button is introduced.
