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


# NervaEdu teacher registration fields

Teacher sign-up now clearly supports:
- Multi-select subject choices grouped by Scholarship, G.C.E. O/L and G.C.E. A/L in the production app (populated from the existing subject catalogue).
- Custom subject entries for subjects not present in the catalogue.
- A qualification selector with Bachelor's degree, Master's degree, PhD/Doctorate, B.Ed., PGDE, HND, teaching diploma, teaching certificate, professional qualification and Other.
- A conditional additional-qualification field that becomes required only when "Other" is selected.
- Teacher contact and WhatsApp number fields.

The standalone auth prototype also demonstrates Scholarship, O/L and A/L subject selections and qualification details. It is visual-only and never sends/stores submitted details.

Production registration continues to submit the existing subject and qualification fields to \`/api/register\`, which validates and saves the selected values.
