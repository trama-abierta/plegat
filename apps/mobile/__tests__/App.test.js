/* global jest, test, expect */
import React from 'react';
import renderer from 'react-test-renderer';
import {Linking, Text} from 'react-native';
import App from '../App';
import {completeLogin} from '../src/auth/oauth';

jest.mock('../src/auth/oauth', () => ({beginLogin: jest.fn(), completeLogin: jest.fn()}));

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}) => <View>{children}</View>,
    SafeAreaView: ({children, style}) => <View style={style}>{children}</View>,
  };
});

test('the initial mobile shell only presents Mi jornada', () => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(<App />);
  });
  const labels = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(labels).toContain('Mi jornada');
  expect(labels).not.toContain('Solicitudes');
});

test('handles the OAuth URL both on cold start and while open', async () => {
  const initial = 'plegat://oauth/callback?code=cold&state=one';
  const warm = 'plegat://oauth/callback?code=warm&state=two';
  let emit;
  completeLogin.mockResolvedValue({});
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(initial);
  jest.spyOn(Linking, 'addEventListener').mockImplementation((type, listener) => {
    emit = listener;
    return {remove: jest.fn()};
  });
  let tree;
  await renderer.act(async () => {
    tree = renderer.create(<App />);
    await Promise.resolve();
  });
  expect(completeLogin).toHaveBeenCalledWith(initial);
  await renderer.act(async () => { emit({url: warm}); });
  expect(completeLogin).toHaveBeenCalledWith(warm);
  await renderer.act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});
