import type { Decorator, Preview } from '@storybook/react-vite';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import '../src/styles.css';

const withRouter: Decorator = (Story) => {
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <main className="storybook-canvas">
          <Story />
        </main>
      ),
    },
  ]);
  return <RouterProvider router={router} />;
};

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
    viewport: {
      options: {
        phonePortrait: {
          name: 'Phone portrait',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        tabletPortrait: {
          name: 'Small tablet portrait',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
        tabletLandscape: {
          name: 'Small tablet landscape',
          styles: { width: '1024px', height: '768px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
    },
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default preview;
