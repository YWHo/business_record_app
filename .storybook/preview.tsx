import type { Decorator, Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import '../src/styles.css';

const withRouter: Decorator = (Story) => (
  <MemoryRouter>
    <main className="storybook-canvas">
      <Story />
    </main>
  </MemoryRouter>
);

const preview: Preview = {
  decorators: [withRouter],
  parameters: {
    a11y: { test: 'error' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default preview;
