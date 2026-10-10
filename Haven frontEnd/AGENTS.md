<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep shared navigation/footer in SiteShell around the root Outlet and content on separate leaf routes so navigation stays consistent.
- Reuse existing real-estate content through focused site sections, with route-specific metadata on every leaf for independent sharing.
- Use one route-aware IntersectionObserver and short opacity/transform transitions with reduced-motion fallbacks; avoid scroll-driven animation loops to protect scrolling performance.
