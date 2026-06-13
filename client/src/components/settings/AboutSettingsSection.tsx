import YozakuraLogo from '../../theme/yozakura_logo';

const APP_RELEASE_TAG = import.meta.env.VITE_GITHUB_RELEASE_TAG?.trim() ?? '';
const APP_VERSION_LABEL = APP_RELEASE_TAG || 'Development Version';

const LINKS = {
  github: 'https://github.com/mistval/yozakura',
  wiki: 'https://mistval.github.io/yozakura/docs/intro',
  discord: 'https://discord.com/invite/S92qCjbNHt',
};

export default function AboutSettingsSection() {
  return (
    <div className="flex flex-col items-center space-y-4 justify-center">
      <YozakuraLogo className="w-96" />

      <div className="bordered-section space-y-3 w-full flex flex-col items-center">
        <div className="text-sm text-secondary">
          Version: <span className="font-medium text-primary">{APP_VERSION_LABEL}</span>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="underline hover:text-primary">
            GitHub
          </a>
          <a href={LINKS.wiki} target="_blank" rel="noreferrer" className="underline hover:text-primary">
            Documentation
          </a>
          <a href={LINKS.discord} target="_blank" rel="noreferrer" className="underline hover:text-primary">
            Discord Server
          </a>
        </div>
      </div>
    </div>
  );
}
