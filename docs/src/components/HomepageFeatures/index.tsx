import type { ReactNode } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  /*
  {
    title: 'Structured Memory Continuity',
    Svg: '',
    description: (
      <>
        Conversations generate summaries, memories, and relationship status, helping long-running scenarios
        stay coherent even with many active characters.
      </>
    ),
  },
  {
    title: 'Hybrid Simulation + RP',
    Svg: ,
    description: (
      <>
        Yozakura combines autonomous NPC simulation loops with direct roleplay chat, so the world evolves
        whether the user is present or not.
      </>
    ),
  },
  {
    title: 'Configurable Prompt Templates',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Prompt behavior is template-driven and editable from settings, with access to the entire simulation
        state.
      </>
    ),
  },
  */
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.featureCol)}>
      <div className={styles.featureCard}>
        <div className="text--center">
          <Svg className={styles.featureSvg} role="img" />
        </div>
        <div className={clsx('text--center padding-horiz--md', styles.featureBody)}>
          <Heading as="h3">{title}</Heading>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return undefined;

  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
