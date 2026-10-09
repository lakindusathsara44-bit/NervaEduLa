# NervaEdu official dark authentication animation

The app's sign-in and sign-up shell uses a restrained midnight palette, cyan/blue/violet accents, an animated orbit mark, floating learning/status panels, and a responsive dark form card.

## What changed
- Applied the auth-only stylesheet in \`public/assets/nervaedu-auth-motion.css\`; the signed-in LMS workspace retains its existing theme.
- Replaced the old sun/hills illustration with a lightweight CSS/SVG animated learning motif.
- Kept the existing student/teacher registration fields and login/register API handlers intact.
- Added a self-contained inline HTML prototype at \`/nervaedu-auth-preview.html\` for quick desktop/mobile review. Its form is demonstration-only and does not send or store details.
- Uses \`prefers-reduced-motion\` to reduce animation for accessibility.

## Preview
Run NervaEdu locally and open \`http://localhost:4173/nervaedu-auth-preview.html\`.
The prototype HTML contains its own CSS and JavaScript and has no library or image dependency.

## Notes
The prototype is a visual demo, not a production authentication endpoint. Use the main app at \`/\` for real sign in and sign up.
